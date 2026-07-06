# last.fm now playing widget

Inspired by [spotify-status-without-js] blog post by [Lina].

## Run locally

```bash
LASTFM_API_KEY=your_key LASTFM_USERNAME=me npm start
```

The widget is available at `/widget`, which embeds the long-lived `/widget/stream`
response in an iframe to avoid a perpetual browser loading spinner.

## Create a Last.fm API key

This project uses Last.fm's public `user.getRecentTracks` API and only needs an
API key. You do not need to create a user auth token or session key for this
read-only widget.

1. Sign in to your Last.fm account.
2. Open the Last.fm API docs: `https://www.last.fm/api`.
3. Go to the API account/application page linked from the docs and apply for an
   API account if you do not already have one.
4. Fill in the application details Last.fm asks for, such as:
   - application name
   - description
   - optional logo
5. Save the application and copy the generated API key.
6. Export it before starting the server:

```bash
export LASTFM_API_KEY=your_api_key_here
export LASTFM_USERNAME=your_lastfm_username
npm start
```

Notes:

- Keep the API secret private if Last.fm shows you one, but this app only uses
  the API key.
- Last.fm auth tokens and session keys are only needed for authenticated API
  calls such as writes or account-linked actions.

## Configuration

- `LASTFM_API_KEY`: required for the public Last.fm API adapter.
- `LASTFM_USERNAME`: optional username override. Defaults to `me`.
- `LASTFM_ADAPTER`: `api` by default. `html` is reserved for a future scraper adapter.
- `LASTFM_NOW_PLAYING_POLL_MS`: polling interval while a track is live. Defaults to `15000`.
- `LASTFM_IDLE_POLL_MS`: polling interval while idle or unavailable. Defaults to `45000`.
- `WIDGET_KEEPALIVE_MS`: keepalive cadence for open streaming responses. Defaults to `15000`.

[spotify-status-without-js]: https://lina.sh/blog/spotify-status-without-js
[Lina]: https://lina.sh/
