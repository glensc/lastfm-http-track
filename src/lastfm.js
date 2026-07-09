const API_URL = "https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&format=json&limit=1";

function createLastFmApiAdapter({ apiKey, username, fetchImpl = fetch }) {
  return {
    name: "api",
    async fetchTrack() {
      if (!apiKey) {
        throw new Error("LASTFM_API_KEY is required for the API adapter");
      }

      const url = new URL(API_URL);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("user", username);

      const response = await fetchImpl(url, {
        headers: {
          "user-agent": "lastfm-http-track"
        }
      });

      if (!response.ok) {
        throw new Error(`Last.fm API request failed with ${response.status}`);
      }

      return normalizeRecentTrack(await response.json(), username);
    }
  };
}

function createLastFmHtmlAdapter() {
  return {
    name: "html",
    async fetchTrack() {
      throw new Error("The HTML adapter is not implemented yet");
    }
  };
}

function createLastFmAdapter(options) {
  if (options.adapter === "html") {
    return createLastFmHtmlAdapter(options);
  }

  return createLastFmApiAdapter(options);
}

function normalizeRecentTrack(payload, username) {
  const recentTracks = payload && payload.recenttracks;
  const rawTracks = recentTracks && recentTracks.track;
  const firstTrack = Array.isArray(rawTracks) ? rawTracks[0] : rawTracks;

  if (!firstTrack) {
    return {
      type: "idle",
      username,
      message: `${username} has not played anything recently.`
    };
  }

  const trackName = readText(firstTrack.name);
  const artistName = readText(firstTrack.artist && firstTrack.artist["#text"]);
  const albumName = readText(firstTrack.album && firstTrack.album["#text"]);
  const trackUrl = readText(firstTrack.url);
  const artUrl = pickArtUrl(firstTrack.image);
  const isNowPlaying = firstTrack["@attr"] && firstTrack["@attr"].nowplaying === "true";
  const playedAt = firstTrack.date && firstTrack.date.uts
    ? new Date(Number(firstTrack.date.uts) * 1000).toISOString()
    : null;

  if (!trackName || !artistName || !trackUrl) {
    return {
      type: "error",
      username,
      reason: "malformed",
      message: "Recent track data from Last.fm is incomplete."
    };
  }

  return {
    type: "track",
    username,
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName || "",
    art_url: artUrl,
    track_url: trackUrl,
    is_now_playing: isNowPlaying,
    played_at: playedAt
  };
}

function pickArtUrl(images) {
  if (!Array.isArray(images)) {
    return "";
  }

  for (let index = images.length - 1; index >= 0; index -= 1) {
    const candidate = readText(images[index] && images[index]["#text"]);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  createLastFmAdapter,
  createLastFmApiAdapter,
  createLastFmHtmlAdapter,
  normalizeRecentTrack
};
