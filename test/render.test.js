const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCssPatch, renderShell, toCssString } = require("../src/render");

test("toCssString escapes quotes and newlines", () => {
  assert.equal(toCssString('A "quote"\nline'), '"A \\\"quote\\\"\\A line"');
});

test("buildCssPatch renders track metadata and local art URL", () => {
  const css = buildCssPatch(null, {
    type: "track",
    track_name: "Track",
    artist_name: "Artist",
    album_name: "Album",
    track_url: "https://example.com/track",
    art_version: "abc123",
    is_now_playing: true,
    played_at: null,
    status_text: "Now playing"
  });

  assert.match(css, /--track-name:"Track"/);
  assert.match(css, /\/widget\/art\?v=abc123/);
  assert.match(css, /Now playing/);
});

test("buildCssPatch renders unavailable states", () => {
  const css = buildCssPatch(null, {
    type: "error",
    status_text: "Unavailable",
    message: "Last.fm is down"
  });

  assert.match(css, /--empty-text:"Last\.fm is down"/);
  assert.match(css, /--details-display:none/);
});

test("renderShell opens the Last.fm link in the top-level context", () => {
  const html = renderShell();

  assert.match(html, /<a class="widget__link" href="\/widget\/track" target="_top">Open on Last\.fm<\/a>/);
});

test("renderShell centers mobile widget framing and stacked content", () => {
  const html = renderShell();

  assert.match(html, /@media \(max-width: 480px\) \{/);
  assert.match(html, /body \{\s*min-height: auto;\s*padding: 16px;/);
  assert.match(html, /\.widget \{\s*width: min\(420px, 100%\);\s*border-radius: 16px;/);
  assert.match(html, /\.widget__header \{\s*flex-direction: column;\s*justify-content: center;\s*text-align: center;/);
  assert.match(html, /\.widget__body \{\s*grid-template-columns: 1fr;\s*justify-items: center;\s*text-align: center;/);
  assert.match(html, /\.widget__art \{\s*justify-self: center;/);
  assert.match(html, /\.widget__details \{\s*justify-items: center;/);
  assert.match(html, /\.widget__empty \{\s*text-align: center;/);
  assert.match(html, /\.widget__footer \{\s*text-align: center;/);
});
