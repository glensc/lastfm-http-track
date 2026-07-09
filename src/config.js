function numberFromEnv(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig(env = process.env) {
  return {
    port: numberFromEnv(env.PORT, 3000),
    lastfmApiKey: env.LASTFM_API_KEY || "",
    lastfmUsername: env.LASTFM_USERNAME || "me",
    adapter: env.LASTFM_ADAPTER || "api",
    nowPlayingPollMs: numberFromEnv(env.LASTFM_NOW_PLAYING_POLL_MS, 15000),
    idlePollMs: numberFromEnv(env.LASTFM_IDLE_POLL_MS, 45000),
    keepAliveMs: numberFromEnv(env.WIDGET_KEEPALIVE_MS, 15000)
  };
}

module.exports = {
  loadConfig
};
