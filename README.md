# last.fm now playing widget

Inspired by [spotify-status-without-js] blog post by [Lina].

## Run locally

```bash
LASTFM_API_KEY=your_key LASTFM_USERNAME=me npm start
```

Enable debug logging when you want extra request and polling detail:

```bash
LOG_LEVEL=debug LASTFM_API_KEY=your_key LASTFM_USERNAME=me npm start
```

The widget is available at `/widget`, which embeds the long-lived `/widget/stream`
response in an iframe to avoid a perpetual browser loading spinner.

The browser does not poll Last.fm directly. Connected clients receive updates over
the server-managed `/widget/stream` response, while the server adjusts its own
Last.fm refresh cadence based on current playback and idle time.

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
   - callback URL: for this widget, use any placeholder HTTPS URL such as
     `https://example.com/lastfm/callback`, because this app does not use the
     Last.fm user-auth redirect flow
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
- `LASTFM_IDLE_POLL_MS`: base polling interval while idle or unavailable. Defaults to `45000`.
- `LASTFM_IDLE_POLL_MAX_MS`: maximum idle backoff delay while at least one stream
  subscriber is connected. Defaults to `300000`.
- `LASTFM_UNATTENDED_POLL_MAX_MS`: maximum idle backoff delay with zero stream
  subscribers connected. Defaults to `900000`.
- `LASTFM_IDLE_BACKOFF_MULTIPLIER`: exponential backoff multiplier applied to
  consecutive idle or unavailable refreshes. Defaults to `2`.
- `WIDGET_KEEPALIVE_MS`: keepalive cadence for open streaming responses. Defaults to `15000`.
- `LOG_LEVEL`: `info` by default. Set to `debug` for outbound request, cache,
  and polling detail.
- `TRUST_PROXY`: `false` by default. Set `true` to trust forwarded proxy
  headers from the immediate upstream peer, or use `loopback`,
  `loopback,linklocal`, or `loopback,linklocal,uniquelocal` to only trust
  peers in those address ranges.

Idle polling behavior:

- While Last.fm reports `is_now_playing`, the server keeps the fast
  `LASTFM_NOW_PLAYING_POLL_MS` cadence.
- Consecutive idle or unavailable refreshes back off exponentially from
  `LASTFM_IDLE_POLL_MS` until they reach the configured max.
- When a viewer is connected, the server uses `LASTFM_IDLE_POLL_MAX_MS` to stay
  reasonably responsive.
- With no connected viewers, the server can stretch further up to
  `LASTFM_UNATTENDED_POLL_MAX_MS` to reduce unnecessary refresh traffic.
- The backoff resets when a live track appears, when the displayed track
  changes, and when the first stream subscriber connects after an unattended
  period.

## nginx reverse proxy

When this app runs behind nginx, configure nginx to forward the client address
and scheme:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

The app always logs the socket peer as `remote_address`. When `TRUST_PROXY`
allows the nginx peer, it also logs the resolved end-user address as
`client_ip`.

Only enable proxy-header trust when requests reach the app through a trusted
reverse proxy path. If the app port is reachable directly, block that access
with your firewall, container network policy, or similar controls.

[spotify-status-without-js]: https://lina.sh/blog/spotify-status-without-js
[Lina]: https://lina.sh/
