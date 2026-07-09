const test = require("node:test");
const assert = require("node:assert/strict");

const { createWidgetService } = require("../src/server");

test("widget service keeps fast polling while a track is now playing", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createTrack({ is_now_playing: true }),
      createTrack({ is_now_playing: true })
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 4000,
    idlePollMaxMs: 12000,
    unattendedPollMaxMs: 20000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);
  assert.equal(timers.lastActive().delay, 1500);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 1500);
});

test("widget service increases idle delays and caps them for active subscribers", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createIdle(),
      createIdle(),
      createIdle(),
      createIdle()
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 1000,
    idlePollMaxMs: 4000,
    unattendedPollMaxMs: 8000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);

  const response = createStubResponse();
  service.subscribe(response);
  assert.equal(timers.lastActive().delay, 1000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 2000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 4000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 4000);
});

test("widget service uses a larger unattended idle cap with no subscribers", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createIdle(),
      createIdle(),
      createIdle(),
      createIdle(),
      createIdle()
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 1000,
    idlePollMaxMs: 4000,
    unattendedPollMaxMs: 8000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);
  assert.equal(timers.lastActive().delay, 1000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 2000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 4000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 8000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 8000);
});

test("widget service resets backoff when live playback resumes", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createIdle(),
      createIdle(),
      createTrack({ is_now_playing: true })
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 1000,
    idlePollMaxMs: 4000,
    unattendedPollMaxMs: 8000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);
  assert.equal(timers.lastActive().delay, 1000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 2000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 1500);
});

test("widget service resets idle backoff when the displayed track changes", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createIdle(),
      createIdle(),
      createTrack({
        track_name: "Second Track",
        played_at: "2026-07-06T12:10:00.000Z"
      })
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 1000,
    idlePollMaxMs: 4000,
    unattendedPollMaxMs: 8000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
    now: () => new Date("2026-07-06T12:15:00.000Z")
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);
  assert.equal(timers.lastActive().delay, 1000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 2000);

  await timers.runLast();
  assert.equal(timers.lastActive().delay, 1000);
});

test("widget service immediately pushes cached state and resets idle backoff when a subscriber connects", async () => {
  const timers = createTimerHarness();
  const service = createWidgetService({
    username: "demo-user",
    dataSource: createSequenceDataSource([
      createIdle(),
      createIdle(),
      createIdle(),
      createIdle()
    ]),
    nowPlayingPollMs: 1500,
    idlePollMs: 1000,
    idlePollMaxMs: 4000,
    unattendedPollMaxMs: 8000,
    idleBackoffMultiplier: 2,
    logger: createStubLogger(),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl
  });

  service.start();
  await waitFor(() => timers.lastActive() !== null);
  await timers.runLast();
  await timers.runLast();
  assert.equal(timers.lastActive().delay, 4000);

  const previousHandle = timers.lastActive();
  const response = createStubResponse();
  service.subscribe(response);

  assert.match(response.chunks.join(""), /Waiting for the next scrobble\.|Last played/);
  assert.equal(previousHandle.cleared, true);
  assert.equal(timers.lastActive().delay, 1000);
});

function createSequenceDataSource(states) {
  let index = 0;

  return {
    async fetchTrack() {
      const state = states[Math.min(index, states.length - 1)];
      index += 1;
      return state;
    }
  };
}

function createIdle(overrides = {}) {
  return {
    type: "idle",
    username: "demo-user",
    message: "Waiting for the next scrobble.",
    ...overrides
  };
}

function createTrack(overrides = {}) {
  return {
    type: "track",
    username: "demo-user",
    track_name: "Track",
    artist_name: "Artist",
    album_name: "Album",
    art_url: "",
    track_url: "https://www.last.fm/music/Artist/_/Track",
    is_now_playing: false,
    played_at: "2026-07-06T12:00:00.000Z",
    ...overrides
  };
}

function createStubLogger() {
  return {
    debug() {},
    info() {},
    error() {},
    isDebugEnabled() {
      return true;
    }
  };
}

function createStubResponse() {
  const chunks = [];

  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
    }
  };
}

function createTimerHarness() {
  const handles = [];

  return {
    setTimeoutImpl(fn, delay) {
      const handle = {
        fn,
        delay,
        cleared: false
      };
      handles.push(handle);
      return handle;
    },
    clearTimeoutImpl(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
    lastActive() {
      return handles.findLast((handle) => !handle.cleared) || null;
    },
    async runLast() {
      const handle = this.lastActive();
      assert.ok(handle, "expected an active timer");
      handle.cleared = true;
      await handle.fn();
    }
  };
}

function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 10);
  });
}
