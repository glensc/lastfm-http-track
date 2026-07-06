const http = require("node:http");

const { loadConfig } = require("./config");
const { createLastFmAdapter } = require("./lastfm");
const { buildCssPatch, renderEmbedPage, renderShell } = require("./render");
const {
  buildDisplayState,
  createInitialDisplayState,
  hashContent,
  isSameDisplayState
} = require("./state");

function createWidgetService({
  username,
  dataSource,
  fetchImpl = fetch,
  now = () => new Date(),
  nowPlayingPollMs = 15000,
  idlePollMs = 45000
}) {
  const subscribers = new Set();
  let displayState = createInitialDisplayState(username);
  let sourceState = null;
  let timer = null;
  let isRefreshing = false;
  let stopped = false;
  let artCache = createEmptyArtCache();

  function scheduleNext() {
    clearTimeout(timer);
    const delay = sourceState && sourceState.type === "track" && sourceState.is_now_playing
      ? nowPlayingPollMs
      : idlePollMs;

    timer = setTimeout(runRefresh, delay);
  }

  async function runRefresh() {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;
    try {
      const nextSourceState = await loadSourceState();
      const nextDisplayState = buildDisplayState(nextSourceState, artCache.version, now());

      if (!isSameDisplayState(displayState, nextDisplayState)) {
        const css = buildCssPatch(displayState, nextDisplayState);
        displayState = nextDisplayState;
        broadcast(css);
      } else {
        displayState = nextDisplayState;
      }

      sourceState = nextSourceState;
    } finally {
      isRefreshing = false;
      if (!stopped) {
        scheduleNext();
      }
    }
  }

  async function loadSourceState() {
    try {
      const nextSourceState = await dataSource.fetchTrack();
      await refreshArt(nextSourceState);
      return nextSourceState;
    } catch (error) {
      artCache = createEmptyArtCache();
      return {
        type: "error",
        username,
        reason: "unavailable",
        message: error.message || "Last.fm is temporarily unavailable."
      };
    }
  }

  async function refreshArt(nextSourceState) {
    if (nextSourceState.type !== "track" || !nextSourceState.art_url) {
      artCache = createEmptyArtCache();
      return;
    }

    if (artCache.sourceUrl === nextSourceState.art_url) {
      return;
    }

    const response = await fetchImpl(nextSourceState.art_url, {
      headers: {
        "user-agent": "lastfm-http-track"
      }
    });

    if (!response.ok) {
      artCache = createEmptyArtCache();
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    artCache = {
      sourceUrl: nextSourceState.art_url,
      contentType: response.headers.get("content-type") || "image/jpeg",
      bytes,
      version: hashContent(bytes)
    };
  }

  function start() {
    void runRefresh();
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
  }

  function subscribe(response) {
    subscribers.add(response);
    response.write(buildCssPatch(null, displayState));
  }

  function unsubscribe(response) {
    subscribers.delete(response);
  }

  function broadcast(chunk) {
    for (const response of subscribers) {
      response.write(chunk);
    }
  }

  function getArt() {
    return artCache;
  }

  function getTrackUrl() {
    return displayState.type === "track" ? displayState.track_url : `https://www.last.fm/user/${encodeURIComponent(username)}`;
  }

  function getDisplayState() {
    return displayState;
  }

  return {
    getArt,
    getDisplayState,
    getTrackUrl,
    start,
    stop,
    subscribe,
    unsubscribe
  };
}

function createApp({ config = loadConfig(), dataSource, fetchImpl = fetch, now } = {}) {
  const widgetService = createWidgetService({
    username: config.lastfmUsername,
    dataSource: dataSource || createLastFmAdapter({
      adapter: config.adapter,
      apiKey: config.lastfmApiKey,
      username: config.lastfmUsername,
      fetchImpl
    }),
    fetchImpl,
    now,
    nowPlayingPollMs: config.nowPlayingPollMs,
    idlePollMs: config.idlePollMs
  });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method !== "GET") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    if (url.pathname === "/") {
      response.writeHead(302, { location: "/widget" });
      response.end();
      return;
    }

    if (url.pathname === "/widget") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderEmbedPage());
      return;
    }

    if (url.pathname === "/widget/stream") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive"
      });
      response.write(renderShell({ title: `${config.lastfmUsername} on Last.fm` }));
      widgetService.subscribe(response);

      const keepAlive = setInterval(() => {
        response.write("<!-- keepalive -->\n");
      }, config.keepAliveMs);

      request.on("close", () => {
        clearInterval(keepAlive);
        widgetService.unsubscribe(response);
        response.end();
      });
      return;
    }

    if (url.pathname === "/widget/art") {
      const art = widgetService.getArt();
      if (!art.bytes || url.searchParams.get("v") !== art.version) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Artwork not found");
        return;
      }

      response.writeHead(200, {
        "content-type": art.contentType,
        "cache-control": "public, max-age=31536000, immutable"
      });
      response.end(art.bytes);
      return;
    }

    if (url.pathname === "/widget/track") {
      response.writeHead(302, { location: widgetService.getTrackUrl() });
      response.end();
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  server.on("listening", () => {
    widgetService.start();
  });

  server.on("close", () => {
    widgetService.stop();
  });

  return {
    server,
    widgetService
  };
}

function createEmptyArtCache() {
  return {
    sourceUrl: "",
    contentType: "image/jpeg",
    bytes: null,
    version: ""
  };
}

module.exports = {
  createApp,
  createWidgetService
};
