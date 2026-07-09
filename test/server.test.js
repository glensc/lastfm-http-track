const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/server");
const { getRequestAddressInfo } = require("../src/request-address");

test("widget endpoints expose embed page, stream shell, art proxy, and redirects", async (context) => {
  const { entries, logger } = createStubLogger();
  const artBytes = Buffer.from("image-bytes");
  const fakeDataSource = {
    async fetchTrack() {
      return {
        type: "track",
        username: "demo-user",
        track_name: "Track",
        artist_name: "Artist",
        album_name: "Album",
        art_url: "https://images.example/cover.jpg",
        track_url: "https://www.last.fm/music/Artist/_/Track",
        is_now_playing: true,
        played_at: null
      };
    }
  };

  const fetchImpl = async (url) => {
    if (String(url) === "https://images.example/cover.jpg") {
      return new Response(artBytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }

    throw new Error(`unexpected fetch ${url}`);
  };

  const { server, widgetService } = createApp({
    config: {
      port: 0,
      lastfmUsername: "demo-user",
      keepAliveMs: 1000,
      nowPlayingPollMs: 1000,
      idlePollMs: 1000,
      lastfmApiKey: "",
      adapter: "api",
      trustProxy: {
        enabled: false,
        scopes: []
      }
    },
    dataSource: fakeDataSource,
    fetchImpl,
    logger,
    now: () => new Date("2026-06-17T12:00:00.000Z")
  });

  await new Promise((resolve) => server.listen(0, resolve));
  context.after(() => server.close());

  await waitFor(() => widgetService.getDisplayState().type === "track");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const embedResponse = await fetch(`${baseUrl}/widget`);
  assert.equal(embedResponse.status, 200);
  assert.match(await embedResponse.text(), /<iframe src="\/widget\/stream"/);

  const streamController = new AbortController();
  const streamResponse = await fetch(`${baseUrl}/widget/stream`, {
    signal: streamController.signal
  });
  assert.equal(streamResponse.status, 200);
  const streamReader = streamResponse.body.getReader();
  const firstChunk = await streamReader.read();
  const secondChunk = await streamReader.read();
  const streamText = String(Buffer.concat([
    Buffer.from(firstChunk.value || []),
    Buffer.from(secondChunk.value || [])
  ]));
  assert.match(streamText, /Open on Last\.fm/);
  assert.match(streamText, /--track-name:"Track"/);
  await streamReader.cancel();
  streamController.abort();

  const artVersion = widgetService.getDisplayState().art_version;
  const artResponse = await fetch(`${baseUrl}/widget/art?v=${artVersion}`);
  assert.equal(artResponse.status, 200);
  assert.equal(Buffer.from(await artResponse.arrayBuffer()).toString(), artBytes.toString());

  const trackResponse = await fetch(`${baseUrl}/widget/track`, { redirect: "manual" });
  assert.equal(trackResponse.status, 302);
  assert.equal(trackResponse.headers.get("location"), "https://www.last.fm/music/Artist/_/Track");

  await waitFor(() => entries.some((entry) => entry.message === "stream client disconnected"));
  await waitFor(() => countRequestLogs(entries, "/widget") >= 1);
  await waitFor(() => countRequestLogs(entries, "/widget/art") >= 1);
  await waitFor(() => countRequestLogs(entries, "/widget/track") >= 1);

  assert.equal(
    latestRequestLog(entries, "/widget").fields.status,
    200
  );
  assert.equal(
    latestRequestLog(entries, "/widget/stream").fields.status,
    200
  );
  assert.equal(
    latestRequestLog(entries, "/widget/art").fields.status,
    200
  );
  assert.equal(
    latestRequestLog(entries, "/widget/track").fields.status,
    302
  );
  assert.match(latestRequestLog(entries, "/widget").fields.remote_address, /127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  assert.match(latestRequestLog(entries, "/widget").fields.client_ip, /127\.0\.0\.1|::1/);
  assert.ok(entries.some((entry) => entry.message === "stream client connected" && entry.fields.pathname === "/widget/stream"));
  assert.ok(entries.some((entry) => entry.message === "stream client disconnected" && entry.fields.pathname === "/widget/stream"));
  assert.equal(entries.some((entry) => /keepalive/i.test(entry.message)), false);
});

test("trusted proxy request logs keep peer address and expose forwarded client ip", async (context) => {
  const { entries, logger } = createStubLogger();
  const { server } = createApp({
    config: {
      port: 0,
      lastfmUsername: "demo-user",
      keepAliveMs: 1000,
      nowPlayingPollMs: 1000,
      idlePollMs: 1000,
      lastfmApiKey: "",
      adapter: "api",
      trustProxy: {
        enabled: true,
        scopes: ["all"]
      }
    },
    dataSource: {
      async fetchTrack() {
        return {
          type: "idle",
          username: "demo-user"
        };
      }
    },
    logger,
    now: () => new Date("2026-06-17T12:00:00.000Z")
  });

  await new Promise((resolve) => server.listen(0, resolve));
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/widget`, {
    headers: {
      "x-forwarded-for": "10.0.0.2, 198.51.100.7, 127.0.0.1",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(response.status, 200);
  await waitFor(() => countRequestLogs(entries, "/widget") >= 1);

  const log = latestRequestLog(entries, "/widget").fields;
  assert.match(log.remote_address, /127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  assert.equal(log.client_ip, "198.51.100.7");
  assert.equal(log.forwarded_for, "10.0.0.2, 198.51.100.7, 127.0.0.1");
  assert.equal(log.forwarded_proto, "https");
});

test("request address info ignores forwarded headers without proxy trust", () => {
  const info = getRequestAddressInfo(createRequest({
    remoteAddress: "::ffff:198.51.100.20",
    headers: {
      "x-forwarded-for": "203.0.113.40",
      "x-real-ip": "203.0.113.41"
    }
  }), {
    trustProxy: {
      enabled: false,
      scopes: []
    }
  });

  assert.equal(info.remoteAddress, "::ffff:198.51.100.20");
  assert.equal(info.clientIp, "198.51.100.20");
  assert.equal(info.forwardedFor, "203.0.113.40");
});

test("request address info prefers the left-most public forwarded client ip", () => {
  const info = getRequestAddressInfo(createRequest({
    remoteAddress: "127.0.0.1",
    headers: {
      "x-forwarded-for": "10.0.0.2, 198.51.100.7, 127.0.0.1"
    }
  }), {
    trustProxy: {
      enabled: true,
      scopes: ["loopback"]
    }
  });

  assert.equal(info.clientIp, "198.51.100.7");
});

test("request address info falls back to x-real-ip for trusted proxies", () => {
  const info = getRequestAddressInfo(createRequest({
    remoteAddress: "::1",
    headers: {
      "x-real-ip": "203.0.113.44"
    }
  }), {
    trustProxy: {
      enabled: true,
      scopes: ["loopback"]
    }
  });

  assert.equal(info.clientIp, "203.0.113.44");
});

test("request address info ignores spoofed forwarded headers from untrusted peers", () => {
  const info = getRequestAddressInfo(createRequest({
    remoteAddress: "198.51.100.200",
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "203.0.113.51"
    }
  }), {
    trustProxy: {
      enabled: true,
      scopes: ["loopback"]
    }
  });

  assert.equal(info.clientIp, "198.51.100.200");
});

function createStubLogger() {
  const entries = [];

  function push(level, message, fields) {
    entries.push({ level, message, fields });
  }

  return {
    entries,
    logger: {
      debug(message, fields) {
        push("debug", message, fields);
      },
      info(message, fields) {
        push("info", message, fields);
      },
      error(message, fields) {
        push("error", message, fields);
      },
      isDebugEnabled() {
        return true;
      }
    }
  };
}

function countRequestLogs(entries, pathname) {
  return entries.filter((entry) => entry.message === "request completed" && entry.fields.pathname === pathname).length;
}

function latestRequestLog(entries, pathname) {
  return entries.filter((entry) => entry.message === "request completed" && entry.fields.pathname === pathname).at(-1);
}

function createRequest({ remoteAddress, headers = {} }) {
  return {
    headers,
    socket: {
      remoteAddress
    }
  };
}

function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 20);
  });
}
