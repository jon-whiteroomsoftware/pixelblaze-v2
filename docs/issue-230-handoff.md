# Issue #230 — socket drop/reconnect detection: HANDOFF

> **UPDATE 2026-06-05 (committed checkpoint).** The tree was reverted to the
> "iteration #2" baseline below (connectTimeoutMs=3000, reconnectDelayMs=1000,
> the error-status-only-on-initial-connect fix, NO serialization) and committed
> as-is to capture a known reference point. Debug logging is intentionally LEFT
> IN the commit — the investigation is still open. #230 remains OPEN.
>
> Two distinct problems are now believed to be tangled together; do not conflate
> them again:
>   1. **Reconnect storm on replug** — aborted CONNECTING sockets don't free the
>      ESP's slot promptly, so retries pile up (sockets=2–3), recovery ~60s.
>   2. **First connect often fails even when the device is up** — NEW clue. Leading
>      hypothesis: the per-IP JIT permission gate (#229) adds latency in front of
>      the *first* connect, and connectTimeoutMs=3000 aborts the attempt before the
>      grant + open complete. Needs a clean console capture to confirm: does the
>      first failure show `attempt FAILED after ~3000ms`?
>
> **Dead end tried and reverted this session (do NOT repeat blindly):** making
> `RelayWebSocket.close()` keep its subscription to surface the helper's close
> echo, gating the reconnect loop on that confirmed close, AND making
> `onSocketStale` fire-and-forget async. Result on hardware: WORSE — we opened
> MORE sockets (sockets climbed to 3) and tore down *healthy* OPEN sockets
> (`page-close readyState=1`). The async onSocketStale raced the close-driven
> reconnect so two reconnect chains ran at once. The "wait for confirmed close"
> idea may still be directionally right, but that implementation introduced a
> concurrency bug. Any retry must be serialized through a SINGLE reconnect driver,
> not two independent event handlers.

Status as of 2026-06-05. There is TEMPORARY debug logging in the tree; it is
deliberately committed for now (investigation open) and should be removed before
#230 is closed. Read this whole doc before touching the code again.

## The issue, as it actually evolved

#230 started as "detect a dropped Controller faster (maybe lightweight
polling)." Hardware testing reshaped it through three distinct asks:

1. **Faster drop detection** — turned out to ALREADY work. Fully unplugging the
   Pixelblaze flips the IDE to connecting/disconnected within a few seconds via
   the existing liveness watchdog (#212). NOTE: the bag's on/off switch only cuts
   the LEDs; the board stays powered, so the watchdog correctly sees it as still
   alive. Disconnect testing requires fully unplugging the board.
2. **Auto-reconnect on power-return** — the real problem. When the Pixelblaze is
   powered back on, the IDE did not reconnect on its own; the user had to
   manually disconnect/reconnect.
3. **Two follow-ups once reconnect "worked":** (a) suppress the uncaught
   WebSocket-open error that lights up the "Errors" button on the extension in
   chrome://extensions; (b) shorten time-to-reconnect.

## Hard constraint discovered late (the thing that matters most)

The Pixelblaze is an **ESP with a very small WebSocket pool** (a handful of
slots). We must be **frugal with socket allocation**. A connecting socket squats
on a slot for the entire connect timeout. The failure mode is socket exhaustion:
if our probes pile up, the device runs out of slots and even a legitimate connect
can't get in — which presents as "very hard to connect in general."

Also relevant (see memory `reference_controller-socket-pool`): stray browser
windows or the device's native web UI also consume slots. Before blaming code,
confirm no other clients are holding connections.

## Architecture recap (where the moving parts live)

- `src/engine/PixelblazeConnection.ts` — pure protocol engine. Owns the WS
  lifecycle (open/close/ping/liveness watchdog). Has a `connectTimeoutMs` option
  (added for #230): rejects + closes the socket if `onopen` doesn't arrive in
  time, via a `settled` latch.
- `src/engine/ExtensionControllerProvider.ts` — the v1 Controller backend. Owns
  the ControllerStatus state machine and the reconnect loop. This is where almost
  all of the #230 churn lives.
- `extension/background.js` — the MV3 service worker that owns the REAL
  WebSocket. The page's `RelayWebSocket` proxies across the postMessage seam to
  this. Reload the unpacked extension after ANY change here or the new code stays
  inert (memory `project_reload-extension-after-bg-change`).

## The "closed before established" error — cannot be try/caught

`WebSocket is closed before the connection is established` is emitted by Chrome's
network stack when `close()` is called on a still-CONNECTING socket. It is NOT a
JS exception — no try/catch, no console.error override will suppress it; in a
service worker it surfaces in the extension's Errors tab. The ONLY lever is to
cause fewer of them (fewer aborted-while-connecting sockets). Do not promise to
suppress it outright.

## What has been tried, in order, and the result

1. **connectTimeoutMs added; openConnection set status='error' on every failed
   attempt.** Result: pill went RED and stuck on replug. Root cause: error status
   was shared between the initial connect and the infinite reconnect loop.
   FIX (kept): error status is set ONLY in the initial `connect()`; the reconnect
   loop stays `connecting` and only goes `error` when attempts are exhausted.
2. **connectTimeoutMs=3000, reconnectDelayMs=1000 (roughly the original).**
   Result per user: "it does come back, it just takes a very long time and has to
   try opening like 10 different sockets." Slow but functional. This is the most
   stable state observed.
3. **connectTimeoutMs=8000, reconnectDelayMs=250 ("patient probe" hypothesis).**
   Result: SIGNIFICANTLY WORSE — "never reconnects," "very hard to connect in
   general." Diagnosis: with NO serialization, an 8s timeout × 250ms retry =
   multiple half-open sockets squatting on the ESP's slots at once (logs showed
   `sockets=2`). We DoS'd the device with our own probes. The patient-probe idea
   was wrong for a socket-constrained device.
4. **Serialization guard + connectTimeoutMs=1500, reconnectDelayMs=1000;
   removed all debug logging.** Result: "not really connecting at all." Two
   mistakes: (a) removing debug logging mid-verification (user explicitly
   annoyed); (b) 1500ms is too tight for the real path (relay seam + per-IP
   permission gate #229), so legitimate opens were aborted before completing.
5. **CURRENT STATE: serialization guard kept; connectTimeoutMs back to 3000,
   reconnectDelayMs=1000; debug logging restored.** Result per user: still flaky
   — connect-on-reload works sometimes, not always; reconnect works but only
   after opening "a bunch of sockets," ~30s to recover. Still worse than
   iteration #2.

## Current code state (uncommitted, on main working tree)

`ExtensionControllerProvider.ts`:
- Defaults: `connectTimeoutMs ?? 3000`, `reconnectDelayMs ?? 1000`,
  `maxReconnectAttempts ?? Infinity`, `pingIntervalMs ?? 1000`,
  `livenessTimeoutMs ?? 4000`.
- Serialization additions (the #230-specific machinery):
  - `private connectInFlight = false` — `openConnection` early-returns (resolving
    as success) if a socket is already in flight; set true before
    `conn.connect()`, reset in a `finally`.
  - `private reconnectTimer: unknown = null` — `scheduleReconnect` clears any
    pending timer before setting a new one, so close+stale firing together can't
    stack two parallel loops. `disconnect()` clears it too.
  - `openConnection` defensively calls `this.conn?.close(); this.conn = null`
    before opening a new socket.
- TEMP DEBUG (must be removed before commit): `[pblz-reconnect] attempt → …`,
  `… FAILED after Nms`, `… OPENED after Nms`, and `… skipped — a socket is
  already in flight`.

`extension/background.js`:
- TEMP DEBUG (must be removed before commit): `[pblz-helper] connect/open/error/
  close/page-close` lines with `sockets=` counts and readyState.

`PixelblazeConnection.ts`:
- `connectTimeoutMs` option + `settled`-latch connect(). This is sound; keep it.

Tests (all 1309 pass, tsc clean):
- `ExtensionControllerProvider.test.ts`: fake transport now tracks
  `maxConcurrentSockets()` (Set of live connIds, incremented on `connect`,
  decremented on page `close`). New test "never holds more than one socket
  against the ESP during a reconnect storm" asserts max==1 across a 30s stalled
  storm. Also existing "times out a stalled reconnect attempt …" test.
- `PixelblazeConnection.test.ts`: "connect timeout" describe block.

## Why it's still flaky — leading hypotheses (UNCONFIRMED)

The serialization guard provably caps concurrent sockets at 1 IN TESTS, but the
hardware still opens "a bunch of sockets" to recover and is flaky on first
connect. Candidate explanations to investigate WITH THE LOGS:

- The `connectInFlight` early-return resolves as success (`undefined`) without
  connecting. If it ever fires on a path that needed to actually connect, the
  reconnect chain's `.catch` won't fire and the loop can stall in `connecting`.
  The new "skipped" log line was added precisely to catch this — check whether it
  appears during a stuck session.
- The page-side `RelayWebSocket.close()` and the extension's real socket teardown
  are async across the seam; a new attempt may open before the prior slot is
  actually freed on the ESP, so "one socket in flight" on the PAGE side may still
  be ">1 slot" on the DEVICE side momentarily. The test models the page side, not
  the device's slot-release latency.
- 3000ms timeout × ~10 attempts ≈ the observed ~30s recovery. The recovery is
  dominated by how many stalled attempts happen before the device answers, which
  depends on device boot timing and slot availability, not our delay.
- Per-IP JIT permission gate (#229) may add latency/variability to the FIRST
  connect specifically, explaining connect-on-reload flakiness distinct from
  reconnect flakiness.

## Recommended next step (proposed, not yet done)

The user has said repeatedly that EARLIER iterations were MORE stable. Stop
piling on cleverness. Suggested plan:

1. **Get a clean diff against the last-known-stable baseline.** `git stash` or
   revert the working tree and identify exactly what main looked like before #230
   work began (the reconnect loop pre-serialization). Establish that baseline's
   behavior on hardware as the reference point.
2. **Re-apply ONE change at a time, verifying each on hardware with the logs**
   before adding the next:
   a. `PixelblazeConnection.connectTimeoutMs` (bounds a hung attempt) — likely
      safe and necessary.
   b. The error-status-only-on-initial-connect fix (prevents the red stuck pill).
   c. ONLY THEN consider serialization, and confirm with the `sockets=` logs
      whether it actually reduces device-side slot pressure or just moves it.
3. Keep the debug logging IN until the user explicitly confirms the behavior is
   good on hardware. Do not remove it preemptively again.
4. Only commit (to main, linear history) and close #230 after explicit user
   confirmation on hardware.

## Working agreements / gotchas (from memory + this session)

- Commit directly to main, no feature branches. Never commit/push without
  explicit confirmation.
- Reload the unpacked extension after every background.js change.
- Screenshots: when the user references one without attaching, look in
  `~/Desktop/screenshots` for the most recent file(s).
- Don't remove diagnostics while a hardware investigation is still open.
- The "closed before established" error is unsuppressable via JS; reduce its
  frequency instead.
</content>
</invoke>
