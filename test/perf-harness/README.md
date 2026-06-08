# Perf harness

Four complementary tools live here. Keep their questions apart:

| tool | question | source of truth |
|---|---|---|
| **emulator bench** (`bench.ts`, #247) | "how many ops did my pattern do?" | the in-repo emulator — no hardware |
| **visual drift** (`drift.ts`) | "how much did the image change?" | the in-repo emulator — no hardware |
| **hardware profiler** (`profiler.ts`, #245) | "what does each op cost on the device?" | a physical Pixelblaze on your LAN |
| **hardware FPS bench** (`devbench.ts`, #248) | "did my pattern get faster on the device?" | a physical Pixelblaze on your LAN |

The emulator bench proves an edit was *output-preserving* (checksum) and counts
ops; the drift tool quantifies intentional visual changes; the FPS bench measures
the *whole-frame* speedup the edit actually buys on hardware.

---

## Emulator bench (`npm run bench`, #247)

Times any demo in both **Fast** (float64) and **Precise** (16.16 fixed-point)
modes and emits a **pixel checksum**, so an optimization pass can prove it
changed the speed *without changing the visual*.

```bash
npm run bench -- Kishimisu                  # both modes, time + checksum
npm run bench -- Kishimisu --frames 60 --grid 32x32
npm run bench -- TestPattern3D --grid 12x12x12   # ROWSxCOLSxLAYERS for 3D
npm run bench -- --list                     # available demos
```

The **checksum is the guard rail**: it's an FNV-1a hash of the 8-bit-quantized
RGB buffer over a fixed window of frames at a fixed virtual clock. Re-run after
an edit and compare it *per mode* — identical checksum ⇒ byte-for-byte identical
output, so any frame-time delta is a pure speed change. (8-bit quantization
absorbs sub-ULP float noise between modes/machines while staying sensitive to
real visual change.) The bench picks a default grid by the demo's
dimensionality (1D strip / 2D plane / 3D cube) unless `--grid` overrides it.

### Load-bearing caveat — it counts OPS, not native cost

Every math built-in is a native JS `Math.*` in **both** shims
(`src/engine/shim.ts`); Precise only adds a raw↔float quantization per call. So
the bench rewards **fewer ops, fewer loop iterations, and factoring invariants
into `beforeRender`** — but it will **not** reward `sin`→`wave` or
`sqrt`→`hypot` (it may even *penalize* them, since here `wave` wraps `cos` and
is strictly more work). For true per-call hardware cost, use the profiler below.

This tool is pure and hardware-free; the pure core (`benchCore.ts`) is unit-
tested (`benchCore.test.ts`) and runs in the normal `npm test` gate.

| file | role |
|---|---|
| `bench.ts` | CLI: parse args, load demo + libs off disk, print time + checksum |
| `benchCore.ts` | pure bench engine: bundle → render N frames → mean time + checksum |
| `benchCore.test.ts` | guards checksum determinism & sensitivity |

---

## Visual drift (`npm run drift`)

Compares two pattern sources over the same deterministic emulator frame window
and reports *how much* the pixels changed. This is the lossy-optimization
prefilter: use it when an edit intentionally trades a little visual fidelity for
speed, such as approximating `exp`/`pow`, cutting octaves, lowering raymarch
steps, or replacing a smooth curve with a cheaper one.

```bash
npm run drift -- Kishimisu /tmp/Kishimisu.lossy.js
npm run drift -- /tmp/base.js src/pixelblaze/demos/ZippyZaps.js --mode precise
npm run drift -- PhantomStar /tmp/PhantomStar.fast.js --frames 8 --grid 16x16
```

Output includes the baseline/candidate emulator frame time and checksums, then
8-bit RGB drift metrics:

- `mean` — average absolute channel delta, 0..255.
- `rmse` — root-mean-square channel delta; more sensitive to larger errors.
- `p95` / `max` — tail size, useful for spotting localized artifacts.
- `changed>=N` — fraction of RGB channels whose absolute delta meets the
  threshold (`--threshold`, default 2).

Treat these as a sorting aid, not a judge. A tiny numeric drift can hit a
visually important feature, and a large drift can be perfectly acceptable in a
turbulent or noisy pattern. The intended loop is: generate broad candidates,
use drift to find the promising ones, eyeball them, then use `devbench` for the
real hardware FPS number.

---

## Hardware built-in cost profiler (#245)

Measures the **real relative cost of native Pixelblaze built-ins on actual
hardware** (`sin`, `cos`, `wave`, `pow`, `exp`, `sqrt`, `hypot`, `perlin`, …) and
produces the committed cost table [`costs.md`](./costs.md). Built on the
framework-free `PixelblazeConnection` comms layer (#106).

## Why the emulator can't answer this

Our preview implements **every** math built-in as a native JS `Math.*` call in
both the Fast and Precise paths (`src/engine/shim.ts`); the fidelity path only
quantizes results. So the emulator measures *operation/call count*, not
hardware's per-function cost — and even gets the ordering wrong (`wave()` is
*slower* than `sin()` there, but on hardware `wave()` is a cheap table lookup).
The device is the only source of truth.

**This is a human-in-the-loop, out-of-band tool.** It needs a physical
Pixelblaze on your LAN and is *excluded from the pre-commit gate* (it touches the
network).

## How to run

1. **Hand-load the profiler.** Open the device's stock ElectroMage editor
   (`http://<device-ip>/`), paste in the contents of
   [`profiler.js`](./profiler.js), and save. (Same flow as the divergence probe —
   we deliberately avoid the undocumented binary push protocol.) Leave it active.

2. **Run the profiler**, pointing it at the device and noting the firmware
   version (shown in the editor's settings, e.g. `3.67`):

   ```bash
   PIXELBLAZE_IP=192.168.1.50 PIXELBLAZE_FW=3.67 npm run profile
   ```

3. It auto-tunes the inner-loop count so a frame sits ~40ms (CPU-bound, under the
   watchdog), measures each op against a baseline loop, normalizes to a multiply,
   and writes **`costs.md`**. Commit that table.

## Method

- The profiler runs the selected op `iters` times per frame in a tight loop and
  exports an EMA of the frame time (`ms`). The runner reads it once settled.
- **Net cost = `ms(op) − ms(baseline)`**, divided by `iters`. The baseline
  (`fn=0`) is the *same* loop + dispatch + `frac` wrap with an identity op, so
  loop/frame overhead cancels.
- Costs are reported **relative to a multiply** — robust to per-frame fixed cost
  and the exact `iters`/firmware FPS target.
- Measured in `beforeRender`, isolated from the per-pixel map/LED-output path.

### Anti-cheat

So the bytecode VM can't optimise the loop away: each op's argument is the
running accumulator (no hoisting), the accumulator carries across frames into a
read-back sink (not dead code), and operands wrap through `frac(... + 0.123)`
each iteration to stay in `[0,1)` (bounded — no 16.16 overflow shifting costs).

## Files (profiler)

| file | role |
|---|---|
| `profiler.js` | Pixelblaze-dialect profiler pattern — **hand-loaded onto the device** |
| `profiler.ts` | the runner: connect → auto-tune → measure → normalize → write table |
| `costs.md` | committed deliverable (generated by a live run) |

The `fn` codes in `profiler.js` and the `OPS` table in `profiler.ts` must stay in
sync.

---

## Hardware FPS bench (`npm run devbench`, #248)

Closes the optimization loop on real hardware, fully automated — no hand-loading.
Give it a demo (or any `.js` source file) and it bundles, compiles to device
bytecode, pushes the pattern run-only over the LAN, **confirms the device is
actually rendering it**, then samples the FPS the firmware reports. Pass two or
more sources to get a before/after Δ.

```bash
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- Kishimisu
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- /tmp/Kishimisu.baseline.js Kishimisu
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- a.js b.js --settle 4000 --sample 5000
```

A handy before/after recipe is to diff the committed version against your working
tree: `git show HEAD:src/pixelblaze/demos/Kishimisu.js > /tmp/base.js`, then
`npm run devbench -- /tmp/base.js Kishimisu`.

### How it works (and why it needs no Chrome extension)

The device runs **bytecode**, compiled by its *own* embedded compiler. In the app
that compile is routed through the extension's sandboxed iframe only because MV3
CSP forbids `eval` in a service worker. Node has no such restriction, so devbench
fetches the device compiler over HTTP (`/index.html.gz`), extracts it with the
tested `compilerExtraction.ts`, and evals it in a Node `vm` context with a
`window` shim. Push + FPS readback reuse `PixelblazeConnection` wholesale — the
same Node comms layer `profiler.ts` uses.

- **Active-program guard.** A run-only push mints a throwaway id; after pushing,
  devbench calls `getConfig()` and refuses to report FPS unless
  `activeProgramId` matches the id it pushed. A meaningless number from a
  pattern the device never switched to is thus impossible.
- **FPS sampling.** The firmware streams `fps` in its periodic status frames;
  `PixelblazeConnection` captures the latest passively. devbench discards a
  `--settle` window (default 3 s) then averages distinct readings over a
  `--sample` window (default 4 s).

### Caveat — very slow patterns need a longer sample window

The default 4 s sample assumes a normal frame rate. A pathologically heavy port
can render at a fraction of an FPS (PhantomStar is ~0.24 FPS ≈ 4.2 s/frame on the
16×16 panel), so the default window catches only one or two frames — far too few
to trust a before/after Δ. For sub-1-FPS patterns pass a long window so you
collect ~10 frames per side, e.g. `--settle 6000 --sample 40000`. (Separately, the
post-push active-program guard waits ~2 s for the device to finish loading the
freshly compiled bytecode before calling `getConfig`; too short a wait there makes
`getConfig` time out on the settings packet that carries `brightness`.)

### Caveat — frees the socket pool

The Pixelblaze has a small WebSocket pool; if a connect fails with `ECONNRESET`
while HTTP still answers, another client (a browser tab on the device web UI, the
IDE on `localhost`, the stock editor, the phone app) is holding a socket. Close
it and retry.

## Files (FPS bench)

| file | role |
|---|---|
| `devbench.ts` | bundle → compile (headless) → push → confirm-active → sample FPS → Δ |

It reuses `src/engine`: `bundle.ts`, `compilerExtraction.ts`, `bytecodePush.ts`,
`PixelblazeConnection.ts`. The `buildBytecode` blob layout mirrors
`extension/sandbox.js` (keep in sync if the bytecode format changes).
