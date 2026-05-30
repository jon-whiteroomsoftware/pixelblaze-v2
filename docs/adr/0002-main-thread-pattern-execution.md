# Patterns execute on the main thread, not in a Web Worker

Pattern code is evaluated and rendered on the browser's main thread (rAF render loop + `new Function()` + Canvas 2D), with no Web Worker isolation in v1. The alternative — running patterns in a worker that streams pixel buffers back to the main thread — was rejected as too complex for v1: it would put a `postMessage` boundary between every control callback, var-watcher read, and frame, and would break the synchronous, framework-free engine model that the testing strategy depends on.

## Consequences

- A pattern containing an infinite or pathologically slow loop freezes the entire tab, including the editor, forcing a reload. There is no watchdog (real hardware has one).
- This is partly mitigated by only (re-)evaluating on the periodic clean-compile tick rather than per keystroke, so half-typed broken code never runs. But the gate is "parses + passes Pixelblaze rule validation," which a syntactically valid infinite loop passes — so the risk is reduced, not eliminated.
- Moving to a Web Worker later is a meaningful refactor of the engine/UI boundary, but the engine's pure-function design keeps it tractable. The deferred worker design — a combined pattern-exec + OffscreenCanvas-draw worker, justified by the watchdog and responsiveness rather than throughput — is analysed in `docs/prd/Feature — Pixel Maps & Dimensional Preview.md` → *Threading model (deferred)*. This ADR remains the active decision; that section is forward-looking analysis, not a new commitment.
