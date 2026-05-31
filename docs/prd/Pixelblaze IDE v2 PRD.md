# Pixelblaze IDE v2 — Product Requirements Document

> **Status — mostly built.** The core IDE described here is shipped. For *what the
> system is and how it works as built*, read **`docs/REFERENCE.md`** — it is the
> authoritative description of the current implementation. This PRD now serves a
> narrower purpose: the **why** (the motivation and the decisions behind the product)
> and the **genuinely-deferred** direction that has not been built. Sequencing,
> phase-by-phase build order, and implementation mechanics that were once here have
> been removed — they are either done (see the reference) or captured in the feature
> PRDs and ADRs.

## Terminology

**Pixelblaze** — A hardware controller for LED lighting sold by [ElectroMage](https://electromage.com/). Also refers to the broader ecosystem of hardware, firmware, and tooling ElectroMage provides.

**Pattern** — A small source file written in Pixelblaze's JavaScript-derived language that runs on a Pixelblaze controller. The word also refers to the resulting LED light display.

**Library** — A bundled set of reusable Pixelblaze functions, shipped with the IDE and maintained as read-only source files. Libraries are referenced using `libname.functionName()` syntax and are resolved by the transpiler before execution.

**Transpiled artifact** — The single flat JavaScript file produced by the transpiler. It is valid for both browser preview and hardware upload.

---

## Why

The built-in pattern editor provided by ElectroMage has three significant limitations:

1. Code editing is primitive — no modern IDE features (autocomplete, signature hints, error detection).
2. No offline mode — building and testing patterns requires a connected hardware controller.
3. No code reuse — every pattern must be self-contained; there is no library or shared-function mechanism.

The IDE exists to remove all three: a real editor, a hardware-faithful preview that needs no device, and a library system with one-click export of a flat artifact you paste or upload to a Pixelblaze.

---

## What

A **Vite + React single-page application**, served statically with no backend. All computation runs in the browser. There are no server-side APIs, no remote storage, and no network requirements during normal use — the server's only role is serving the static app files. (The one deliberate exception, the optional out-of-band hardware connectivity layer, is specified in its own feature PRD and is purely additive — see below.)

The shipped feature set — engine/UI boundary, transpiler/bundler, Pixelblaze-dialect validator, runtime shim, hardware-fidelity fixed-point preview, pixel maps & 1D/2D/3D preview, Monaco editor, pattern storage, UI controls + var watcher, libraries & demos, and export — is described in full in **`docs/REFERENCE.md`**.

---

## Decisions worth remembering

The "why" behind the shape of the product. Mechanics are in the reference; rationale lives here and in the ADRs.

- **Offline-first, no backend.** Everything happens browser-side. This is the core stance — authoring never requires a device or a network. The hardware connectivity layer is the one additive exception and is deliberately out-of-band (see `Feature - Hardware Connectivity.md`).
- **Hard engine/UI boundary.** All logic that can be separated from React is a pure TypeScript module (`src/engine/`, zero React imports); components are thin wrappers. This is what makes the tricky math (fixed-point ops, camera projection, dependency resolution) unit-testable without a DOM, and it is non-negotiable for new work.
- **Single flat artifact.** `bundle()` returns `{ code, … }`; `code` is the one file used for *both* browser preview and hardware upload, with function-level tree-shaking so only referenced library functions are inlined (critical for the device's memory limits). Preview-only companions (metadata, the fixed-point emit) never reach the hardware file.
- **Libraries are Pixelblaze-dialect `.js`, namespaced by filename.** Acorn parses them directly and the bundled artifact must be valid Pixelblaze code; the filename is the namespace (`SDF.js` → `SDF.*`).
- **Fixed-point fidelity by default** (ADR-0003, superseding ADR-0001's float64-only stance): the preview defaults to faithful 16.16 emulation so what you see survives upload, with a "Fast" float64 escape hatch. The fidelity engine and the ShaderToy porting toolkit built on it shipped in full — see ADR-0003 and `docs/REFERENCE.md` §8 (fixed-point engine) and §14.1 (porting toolkit).
- **Main-thread execution** (ADR-0002): patterns run on the main thread via `new Function()` + rAF. A syntactically valid infinite loop can still freeze the tab — there is no watchdog. Accepted; a worker is the designated future lever (analysed in the Pixel Maps feature PRD).
- **The pixel map is a first-class, workspace-owned entity** (ADR-0004/0005): position is decoupled from index, and the workspace — not a connected device — owns the map. See `Feature - Pixel Maps & Dimensional Preview.md`.

---

## Testing philosophy

Unchanged and load-bearing: pure functions are the primary test target; the engine layer carries heavy coverage, React components get smoke tests only; a Husky pre-commit gate runs `npm run lint && npm test`. The live hardware tier is excluded from the gate and run out-of-band. Details and current conventions are in `CLAUDE.md` and `docs/REFERENCE.md` §18.

---

## Deferred — not yet built

Only genuinely-unbuilt scope remains here. Items the original PRD deferred that have since *shipped* — the 2D/3D coordinate-transform stack, the Pixelblaze-accurate array type, 1D `render` and `render3D` support, load-pattern-from-disk (`.epe` import), library demos and progressive demo patterns, and human-assisted ShaderToy porting — are done and described in the reference; they are not repeated here.

### Captured in feature PRDs (direction, not greenlit)

- **Hardware upload & a connection UI** — `Feature - Hardware Connectivity.md`. The Node comms layer and capability spike have shipped; the local bridge + in-app connection UI (Phase 3) is deferred there.
- **Device maps (Phase 3)** — `Feature - Pixel Maps & Dimensional Preview.md`. Stock maps and the dimensional preview shipped; **custom-map authoring (Phase 2) is now greenlit and building** — stock maps become source-backed plain-JS (single source of truth, ADR-0008), and a coder-first New Map flow loads any stock map as an editable **template**. Controller map push/pull (Phase 3) is still deferred there.

### Still open / unfiled

- **Output control types** — `showNumber` and `gauge` are *output* controls needing a poll-and-display path distinct from the four shipped input controls; `trigger` (fire-once) and `inputNumber` (unconstrained numeric) round out the set. Until they ship, patterns using these prefixes load and run with the widget simply absent.
- **Automated GLSL→Pixelblaze rewrite** — *automatically* rewriting GLSL shaders into Pixelblaze's language. (Human-assisted porting — the `Shader` library + the porting guide — has shipped; only the fully-automated rewrite remains a research idea.)
