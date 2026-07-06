# last.fm now playing widget

Inspired by [spotify-status-without-js] blog post by [Lina].

## Run locally

```bash
LASTFM_API_KEY=your_key LASTFM_USERNAME=me npm start
```

The widget is available at `/widget`, which embeds the long-lived `/widget/stream`
response in an iframe to avoid a perpetual browser loading spinner.

## Configuration

- `LASTFM_API_KEY`: required for the public Last.fm API adapter.
- `LASTFM_USERNAME`: optional username override. Defaults to `me`.
- `LASTFM_ADAPTER`: `api` by default. `html` is reserved for a future scraper adapter.
- `LASTFM_NOW_PLAYING_POLL_MS`: polling interval while a track is live. Defaults to `15000`.
- `LASTFM_IDLE_POLL_MS`: polling interval while idle or unavailable. Defaults to `45000`.
- `WIDGET_KEEPALIVE_MS`: keepalive cadence for open streaming responses. Defaults to `15000`.

[spotify-status-without-js]: https://lina.sh/blog/spotify-status-without-js
[Lina]: https://lina.sh/
