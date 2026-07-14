const http = require("node:http");

const { loadConfig } = require("./config");
const { createLastFmAdapter } = require("./lastfm");
const { createLoggedFetch, createLogger } = require("./logger");
const { getRequestAddressInfo } = require("./request-address");
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
  idlePollMs = 45000,
  idlePollMaxMs = 300000,
  unattendedPollMaxMs = 900000,
  idleBackoffMultiplier = 2,
  logger = createLogger(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
}) {
  const subscribers = new Set();
  let displayState = createInitialDisplayState(username);
  let sourceState = null;
  let timer = null;
  let isRefreshing = false;
  let stopped = false;
  let artCache = createEmptyArtCache();
  let consecutiveIdleRefreshes = 0;

  function scheduleNext() {
    clearTimeoutImpl(timer);
    const delay = getNextDelayMs();

    logger.debug("scheduled refresh", {
      delay_ms: delay,
      state_type: sourceState ? sourceState.type : "startup",
      idle_refreshes: consecutiveIdleRefreshes,
      subscriber_count: subscribers.size
    });

    timer = setTimeoutImpl(runRefresh, delay);
  }

  function getNextDelayMs() {
    if (sourceState && sourceState.type === "track" && sourceState.is_now_playing) {
      return nowPlayingPollMs;
    }

    const maxDelay = subscribers.size > 0 ? idlePollMaxMs : unattendedPollMaxMs;
    const multiplier = Math.max(1, idleBackoffMultiplier);
    const exponent = Math.max(0, consecutiveIdleRefreshes - 1);

    return Math.min(
      idlePollMs * (multiplier ** exponent),
      maxDelay
    );
  }

  async function runRefresh() {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;
    try {
      const nextSourceState = await loadSourceState();
      const nextDisplayState = buildDisplayState(nextSourceState, artCache.version, now());
      updateBackoffState(sourceState, nextSourceState);

      if (!isSameDisplayState(displayState, nextDisplayState)) {
        const css = buildCssPatch(displayState, nextDisplayState);
        displayState = nextDisplayState;
        broadcast(css);
      } else {
        logger.debug("refresh unchanged", {
          state_type: nextDisplayState.type
        });
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

  function updateBackoffState(previousSourceState, nextSourceState) {
    if (nextSourceState.type === "track" && nextSourceState.is_now_playing) {
      consecutiveIdleRefreshes = 0;
      return;
    }

    if (didDisplayedSourceChange(previousSourceState, nextSourceState)) {
      consecutiveIdleRefreshes = 1;
      return;
    }

    consecutiveIdleRefreshes += 1;
  }

  async function loadSourceState() {
    try {
      const nextSourceState = await dataSource.fetchTrack();
      await refreshArt(nextSourceState);
      return nextSourceState;
    } catch (error) {
      artCache = createEmptyArtCache();
      logger.error("refresh failed", {
        error: error.message
      });
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
      logger.debug("artwork cache cleared", {
        reason: nextSourceState.type !== "track" ? "not-track" : "missing-art"
      });
      artCache = createEmptyArtCache();
      return;
    }

    if (artCache.sourceUrl === nextSourceState.art_url) {
      logger.debug("artwork cache hit", {
        source_url: nextSourceState.art_url
      });
      return;
    }

    logger.debug("artwork cache miss", {
      source_url: nextSourceState.art_url
    });

    const response = await fetchImpl(nextSourceState.art_url, {
      headers: {
        "user-agent": "lastfm-http-track"
      }
    }, {
      purpose: "artwork"
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
    clearTimeoutImpl(timer);
  }

  function subscribe(response) {
    const hadSubscribers = subscribers.size > 0;
    subscribers.add(response);
    response.write(buildCssPatch(null, displayState));

    if (!hadSubscribers && sourceState && !(sourceState.type === "track" && sourceState.is_now_playing)) {
      consecutiveIdleRefreshes = 1;
      scheduleNext();
    }
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

function createApp({ config = loadConfig(), dataSource, fetchImpl = fetch, now, logger = createLogger({ level: config.logLevel }) } = {}) {
  const loggedFetch = createLoggedFetch({
    fetchImpl,
    logger
  });

  const widgetService = createWidgetService({
    username: config.lastfmUsername,
    dataSource: dataSource || createLastFmAdapter({
      adapter: config.adapter,
      apiKey: config.lastfmApiKey,
      username: config.lastfmUsername,
      fetchImpl: loggedFetch,
      logger
    }),
    fetchImpl: loggedFetch,
    now,
    nowPlayingPollMs: config.nowPlayingPollMs,
    idlePollMs: config.idlePollMs,
    idlePollMaxMs: config.idlePollMaxMs,
    unattendedPollMaxMs: config.unattendedPollMaxMs,
    idleBackoffMultiplier: config.idleBackoffMultiplier,
    logger
  });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const requestLogFields = buildRequestLogFields(request, url, config);
    const startedAt = Date.now();
    let didLogRequestCompletion = false;

    function logRequestCompletion() {
      if (didLogRequestCompletion) {
        return;
      }

      didLogRequestCompletion = true;
      logger.info("request completed", {
        ...requestLogFields,
        duration_ms: Date.now() - startedAt,
        status: response.statusCode
      });
    }

    response.on("finish", logRequestCompletion);
    response.on("close", logRequestCompletion);

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
      logger.info("stream client connected", requestLogFields);
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
        logger.info("stream client disconnected", requestLogFields);
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

function buildRequestLogFields(request, url, config) {
  const addressInfo = getRequestAddressInfo(request, config);

  return {
    method: request.method,
    pathname: url.pathname,
    query: url.search ? url.search.slice(1) : undefined,
    remote_address: addressInfo.remoteAddress,
    client_ip: addressInfo.clientIp,
    forwarded_for: addressInfo.forwardedFor,
    forwarded_proto: addressInfo.forwardedProto,
    user_agent: request.headers["user-agent"]
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

function didDisplayedSourceChange(previousSourceState, nextSourceState) {
  if (!previousSourceState) {
    return true;
  }

  if (previousSourceState.type !== nextSourceState.type) {
    return true;
  }

  if (nextSourceState.type === "track") {
    return [
      "track_name",
      "artist_name",
      "album_name",
      "track_url",
      "art_url",
      "is_now_playing",
      "played_at"
    ].some((key) => previousSourceState[key] !== nextSourceState[key]);
  }

  if (nextSourceState.type === "idle") {
    return previousSourceState.message !== nextSourceState.message;
  }

  return previousSourceState.reason !== nextSourceState.reason || previousSourceState.message !== nextSourceState.message;
}

module.exports = {
  createApp,
  createWidgetService
};
