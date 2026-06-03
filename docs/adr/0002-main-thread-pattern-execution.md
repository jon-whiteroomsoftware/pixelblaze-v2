# Patterns execute on the main thread, not in a Web Worker

Pattern code is evaluated and rendered on the browser's main thread (rAF render loop + `new Function()` + Canvas 2D), with no Web Worker isolation in v1. The alternative — running patterns in a worker that streams pixel buffers back to the main thread — was rejected as too complex for v1: it would put a `postMessage` boundary between every control callback, var-watcher read, and frame, and would break the synchronous, framework-free engine model that the testing strategy depends on.

## Consequences

- A pattern containing an infinite or pathologically slow loop freezes the entire tab, including the editor, forcing a reload. There is no watchdog (real hardware has one).
- This is partly mitigated by only (re-)evaluating on the periodic clean-compile tick rather than per keystroke, so half-typed broken code never runs. But the gate is "parses + passes Pixelblaze rule validation," which a syntactically valid infinite loop passes — so the risk is reduced, not eliminated.
- Moving to a Web Worker later is a meaningful refactor of the engine/UI boundary, but the engine's pure-function design keeps it tractable. The deferred worker design is analysed below. This ADR remains the active decision; that analysis is forward-looking, not a new commitment.

## Deferred worker design (forward-looking analysis)

3D rendering reopens this decision, so the future move is pre-researched here. **The conclusion stands: stay on the main thread for now.** A worker is the designated future lever — recorded so the eventual decision is not started cold. (This analysis previously lived in the now-retired Pixel Maps feature PRD; the dimensional-preview work it accompanied has shipped — see `docs/PXLBLZ Technical Reference.md` §8, §10.)

**What a worker buys — and doesn't.** A Web Worker *relocates* pattern execution; it does **not accelerate** it (same engine, same single core, same fixed-point shim cost). So a worker is **not a 3D-throughput fix** — that remains the job of the `MAX_PIXEL_COUNT` cap and the small default 3D map. Its two real prizes are about *where* the work runs:

- **Responsiveness** — the editor, controls, and var-watcher stay live while a heavy 3D pattern grinds; today a slow frame janks the whole UI.
- **A real watchdog** (the big one) — a worker is terminable. The main thread can `terminate()` a stalled worker after a timeout and report "pattern stalled" — the watchdog that real hardware has and this preview lacks (the unmitigated freeze consequence above).

**The designated architecture: one combined worker (config C).** Run **exec *and* OffscreenCanvas draw together in one worker** — the whole hot loop (render fns → shim → projection → draw) lives in the worker, and **pixel buffers never cross the boundary**. The only crossings are low-frequency (control changes / camera-orbit events in; var-watcher + FPS snapshots out), so the per-frame `postMessage` cost evaporates. The alternatives are inferior: (A) exec-in-worker + main-thread draw ships a pixel buffer every frame; (B) draw-only-in-worker ships the buffer *into* the worker for one cheap `gl.POINTS` call. OffscreenCanvas is not a separate "thread the WebGL" win — it is the thing that makes an exec-worker clean. Config C **needs no `SharedArrayBuffer`** (which would require cross-origin-isolation headers GitHub Pages cannot set); transferables + low-frequency messaging suffice.

**Why it is deferred, not free.** The honest price: the engine's **synchronous, framework-free orchestration becomes message-passing async** — exactly the model this ADR's testing strategy depends on. Mitigated by design (the pure modules — `camera.ts`, generators, shim math, dimensionality derivation — stay synchronously unit-testable; only `renderLoop` orchestration goes async), but it is real work at the engine/UI seam, not justified until the watchdog or 3D responsiveness genuinely bites.
