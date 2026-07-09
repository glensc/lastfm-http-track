const crypto = require("node:crypto");

function createInitialDisplayState(username) {
  return {
    type: "loading",
    username,
    status_text: "Loading Last.fm status...",
    message: "Waiting for the first Last.fm poll."
  };
}

function buildDisplayState(sourceState, artVersion, now = new Date()) {
  if (sourceState.type === "track") {
    return {
      type: "track",
      username: sourceState.username,
      track_name: sourceState.track_name,
      artist_name: sourceState.artist_name,
      album_name: sourceState.album_name,
      track_url: sourceState.track_url,
      art_url: sourceState.art_url,
      art_version: artVersion,
      is_now_playing: sourceState.is_now_playing,
      played_at: sourceState.played_at,
      status_text: sourceState.is_now_playing
        ? "Now playing"
        : `Last played ${formatRelativeTime(sourceState.played_at, now)}`
    };
  }

  if (sourceState.type === "idle") {
    return {
      type: "idle",
      username: sourceState.username,
      status_text: "Last played",
      message: sourceState.message
    };
  }

  return {
    type: "error",
    username: sourceState.username,
    status_text: "Unavailable",
    message: sourceState.message,
    reason: sourceState.reason || "unavailable"
  };
}

function isSameDisplayState(previousState, nextState) {
  if (!previousState || !nextState || previousState.type !== nextState.type) {
    return false;
  }

  if (nextState.type === "track") {
    return [
      "track_name",
      "artist_name",
      "album_name",
      "track_url",
      "art_version",
      "is_now_playing",
      "played_at",
      "status_text"
    ].every((key) => previousState[key] === nextState[key]);
  }

  return previousState.status_text === nextState.status_text && previousState.message === nextState.message;
}

function needsFullTrackCss(previousState, nextState) {
  if (!previousState || nextState.type !== "track" || previousState.type !== "track") {
    return true;
  }

  return [
    "track_name",
    "artist_name",
    "album_name",
    "track_url",
    "art_version",
    "is_now_playing",
    "played_at"
  ].some((key) => previousState[key] !== nextState[key]);
}

function hashContent(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 12);
}

function formatRelativeTime(isoTime, now = new Date()) {
  if (!isoTime) {
    return "recently";
  }

  const playedAt = new Date(isoTime);
  if (Number.isNaN(playedAt.valueOf())) {
    return "recently";
  }

  const diffSeconds = Math.max(0, Math.floor((now.valueOf() - playedAt.valueOf()) / 1000));

  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  return playedAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

module.exports = {
  buildDisplayState,
  createInitialDisplayState,
  formatRelativeTime,
  hashContent,
  isSameDisplayState,
  needsFullTrackCss
};
