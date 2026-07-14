function renderShell({ title = "Last.fm widget" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --widget-bg: #101114;
      --widget-fg: #f5f7fb;
      --widget-muted: #9ba3b5;
      --widget-border: rgba(255, 255, 255, 0.12);
      --widget-live: #ff4d6d;
      --widget-idle: #7cc6ff;
      --track-name: "";
      --artist-name: "";
      --album-name: "";
      --status-text: "";
      --empty-text: "";
      --art-display: none;
      --album-display: none;
      --details-display: grid;
      --empty-display: none;
      --badge-color: var(--widget-idle);
      --badge-glow: rgba(124, 198, 255, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: transparent;
      color: var(--widget-fg);
      font: 500 16px/1.4 system-ui, sans-serif;
    }

    .widget {
      width: min(100%, 420px);
      padding: 16px;
      border: 1px solid var(--widget-border);
      border-radius: 18px;
      background:
        radial-gradient(circle at top right, rgba(255, 77, 109, 0.18), transparent 36%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
        var(--widget-bg);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
    }

    .widget__header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
      align-items: center;
      color: var(--widget-muted);
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.08em;
    }

    .widget__provider::before {
      content: "Last.fm";
    }

    .widget__status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .widget__status-badge::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--badge-color);
      box-shadow: 0 0 0 6px var(--badge-glow);
    }

    .widget__body {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: center;
    }

    .widget__art {
      width: 88px;
      aspect-ratio: 1;
      display: var(--art-display);
      background-position: center;
      background-size: cover;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background-color: rgba(255, 255, 255, 0.04);
    }

    .widget__details {
      display: var(--details-display);
      gap: 2px;
      min-width: 0;
    }

    .widget__title,
    .widget__artist,
    .widget__album,
    .widget__status,
    .widget__empty {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .widget__title {
      font-size: 20px;
      font-weight: 700;
    }

    .widget__title::before {
      content: var(--track-name);
    }

    .widget__artist {
      color: rgba(245, 247, 251, 0.92);
    }

    .widget__artist::before {
      content: var(--artist-name);
    }

    .widget__album {
      display: var(--album-display);
      color: var(--widget-muted);
      font-size: 14px;
    }

    .widget__album::before {
      content: var(--album-name);
    }

    .widget__status {
      margin-top: 8px;
      color: var(--widget-muted);
      font-size: 14px;
    }

    .widget__status::before {
      content: var(--status-text);
    }

    .widget__empty {
      display: var(--empty-display);
      color: var(--widget-muted);
    }

    .widget__empty::before {
      content: var(--empty-text);
    }

    .widget__footer {
      margin-top: 14px;
    }

    .widget__link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: inherit;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.03);
    }

    @media (max-width: 480px) {
      body {
        min-height: auto;
      }

      .widget {
        border-radius: 16px;
      }

      .widget__body {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <article class="widget" data-widget-root>
    <header class="widget__header">
      <span class="widget__provider"></span>
      <span class="widget__status-badge"></span>
    </header>
    <section class="widget__body">
      <div class="widget__art"></div>
      <div class="widget__details">
        <div class="widget__title"></div>
        <div class="widget__artist"></div>
        <div class="widget__album"></div>
        <div class="widget__status"></div>
      </div>
      <div class="widget__empty"></div>
    </section>
    <footer class="widget__footer">
      <a class="widget__link" href="/widget/track" target="_top">Open on Last.fm</a>
    </footer>
  </article>
`;
}

function renderEmbedPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Last.fm widget</title>
  <style>
    html, body, iframe {
      margin: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
    }
  </style>
</head>
<body>
  <iframe src="/widget/stream" title="Last.fm widget" loading="eager"></iframe>
</body>
</html>`;
}

function buildCssPatch(previousState, nextState) {
  if (nextState.type === "track") {
    if (previousState && previousState.type === "track" && previousState.track_name === nextState.track_name && previousState.artist_name === nextState.artist_name && previousState.album_name === nextState.album_name && previousState.track_url === nextState.track_url && previousState.art_version === nextState.art_version && previousState.is_now_playing === nextState.is_now_playing && previousState.played_at === nextState.played_at) {
      return wrapStyle(buildStatusCss(nextState));
    }

    return wrapStyle(buildTrackCss(nextState));
  }

  return wrapStyle(buildUnavailableCss(nextState));
}

function buildTrackCss(state) {
  const artRule = state.art_version
    ? `.widget__art{background-image:url("/widget/art?v=${encodeURIComponent(state.art_version)}");}`
    : ".widget__art{background-image:none;}";

  return `${buildRootVariables({
    trackName: state.track_name,
    artistName: state.artist_name,
    albumName: state.album_name,
    statusText: state.status_text,
    emptyText: "",
    artDisplay: state.art_version ? "block" : "none",
    albumDisplay: state.album_name ? "block" : "none",
    detailsDisplay: "grid",
    emptyDisplay: "none",
    badgeColor: state.is_now_playing ? "var(--widget-live)" : "var(--widget-idle)",
    badgeGlow: state.is_now_playing ? "rgba(255, 77, 109, 0.14)" : "rgba(124, 198, 255, 0.12)"
  })}
.widget__status-badge::after{content:${toCssString(state.status_text)};}
${artRule}
.widget__status-badge::after{margin-left:8px;color:var(--widget-muted);text-transform:none;letter-spacing:normal;font-size:12px;}`;
}

function buildStatusCss(state) {
  return `${buildRootVariables({ statusText: state.status_text })}
.widget__status-badge::after{content:${toCssString(state.status_text)};}
.widget__status-badge::after{margin-left:8px;color:var(--widget-muted);text-transform:none;letter-spacing:normal;font-size:12px;}`;
}

function buildUnavailableCss(state) {
  return `${buildRootVariables({
    trackName: "",
    artistName: "",
    albumName: "",
    statusText: state.status_text,
    emptyText: state.message,
    artDisplay: "none",
    albumDisplay: "none",
    detailsDisplay: "none",
    emptyDisplay: "block",
    badgeColor: "var(--widget-idle)",
    badgeGlow: "rgba(124, 198, 255, 0.12)"
  })}
.widget__status-badge::after{content:${toCssString(state.status_text)};}
.widget__status-badge::after{margin-left:8px;color:var(--widget-muted);text-transform:none;letter-spacing:normal;font-size:12px;}
.widget__art{background-image:none;}`;
}

function buildRootVariables(values) {
  const lines = [];
  if (Object.hasOwn(values, "trackName")) {
    lines.push(`--track-name:${toCssString(values.trackName)};`);
  }
  if (Object.hasOwn(values, "artistName")) {
    lines.push(`--artist-name:${toCssString(values.artistName)};`);
  }
  if (Object.hasOwn(values, "albumName")) {
    lines.push(`--album-name:${toCssString(values.albumName)};`);
  }
  if (Object.hasOwn(values, "statusText")) {
    lines.push(`--status-text:${toCssString(values.statusText)};`);
  }
  if (Object.hasOwn(values, "emptyText")) {
    lines.push(`--empty-text:${toCssString(values.emptyText)};`);
  }
  if (Object.hasOwn(values, "artDisplay")) {
    lines.push(`--art-display:${values.artDisplay};`);
  }
  if (Object.hasOwn(values, "albumDisplay")) {
    lines.push(`--album-display:${values.albumDisplay};`);
  }
  if (Object.hasOwn(values, "detailsDisplay")) {
    lines.push(`--details-display:${values.detailsDisplay};`);
  }
  if (Object.hasOwn(values, "emptyDisplay")) {
    lines.push(`--empty-display:${values.emptyDisplay};`);
  }
  if (Object.hasOwn(values, "badgeColor")) {
    lines.push(`--badge-color:${values.badgeColor};`);
  }
  if (Object.hasOwn(values, "badgeGlow")) {
    lines.push(`--badge-glow:${values.badgeGlow};`);
  }

  return `:root{${lines.join("")}}`;
}

function wrapStyle(cssText) {
  return `<style>${cssText}</style>\n`;
}

function toCssString(value) {
  const text = typeof value === "string" ? value : "";
  const escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/</g, "\\3C ")
      .replace(/\r/g, "")
      .replace(/\n/g, "\\A ")
      .replace(/"/g, "\\\"");

  return `"${escaped}"`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  buildCssPatch,
  buildStatusCss,
  buildTrackCss,
  buildUnavailableCss,
  renderEmbedPage,
  renderShell,
  toCssString
};
