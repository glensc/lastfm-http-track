const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/server");

test("widget endpoints expose embed page, stream shell, art proxy, and redirects", async (context) => {
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
      adapter: "api"
    },
    dataSource: fakeDataSource,
    fetchImpl,
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
});

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
