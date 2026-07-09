const test = require("node:test");
const assert = require("node:assert/strict");

const { createLastFmApiAdapter } = require("../src/lastfm");
const { createLoggedFetch, createLogger } = require("../src/logger");

test("api adapter logs outbound requests with redacted debug fields", async () => {
  const entries = [];
  const logger = createLogger({
    level: "debug",
    sink(entry) {
      entries.push(entry);
    }
  });
  const loggedFetch = createLoggedFetch({
    fetchImpl: async () => new Response(JSON.stringify({
      recenttracks: {
        track: {
          name: "Track",
          artist: { "#text": "Artist" },
          album: { "#text": "Album" },
          url: "https://www.last.fm/music/Artist/_/Track",
          image: [{ "#text": "https://images.example/cover.jpg" }],
          "@attr": { nowplaying: "true" }
        }
      }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }),
    logger,
    now: createNow([100, 112])
  });

  const adapter = createLastFmApiAdapter({
    apiKey: "super-secret-key",
    username: "demo-user",
    fetchImpl: loggedFetch
  });

  const track = await adapter.fetchTrack();
  assert.equal(track.type, "track");

  assert.ok(entries.some((entry) => entry.level === "info" && entry.message === "outbound request completed" && entry.fields.purpose === "lastfm-api" && entry.fields.status === 200));

  const debugUrl = entries.find((entry) => entry.level === "debug" && entry.message === "outbound request detail").fields.url;
  assert.match(debugUrl, /api_key=%5Bredacted%5D/);
  assert.doesNotMatch(debugUrl, /super-secret-key/);
  assert.doesNotMatch(JSON.stringify(entries), /super-secret-key/);
});

test("api adapter suppresses debug logs when log level is info", async () => {
  const entries = [];
  const logger = createLogger({
    level: "info",
    sink(entry) {
      entries.push(entry);
    }
  });
  const loggedFetch = createLoggedFetch({
    fetchImpl: async () => new Response(JSON.stringify({
      recenttracks: {
        track: {
          name: "Track",
          artist: { "#text": "Artist" },
          album: { "#text": "Album" },
          url: "https://www.last.fm/music/Artist/_/Track",
          image: [],
          date: { uts: "1718625600" }
        }
      }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }),
    logger,
    now: createNow([200, 215])
  });

  const adapter = createLastFmApiAdapter({
    apiKey: "super-secret-key",
    username: "demo-user",
    fetchImpl: loggedFetch
  });

  await adapter.fetchTrack();

  assert.ok(entries.some((entry) => entry.level === "info" && entry.message === "outbound request completed"));
  assert.equal(entries.some((entry) => entry.level === "debug"), false);
});

function createNow(values) {
  let index = 0;

  return () => {
    const value = values[index];
    index += 1;
    return value;
  };
}
