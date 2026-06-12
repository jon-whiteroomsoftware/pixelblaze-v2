# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment notes

This project lives under a path containing spaces (Google Drive folder). Never warn about embedded spaces in paths when running commands within this project directory.

### Preview screenshots / browser automation (`?capture`)

The WebGL preview render loop keeps the page perpetually busy, so naive screenshot tools time out and the canvas drawing buffer is unreadable by default. When you need to screenshot the app — and especially the preview renderer — load the dev server with the `?capture` query param (e.g. `http://localhost:5174/?capture`). This is dev-only and inert without the param. It enables `preserveDrawingBuffer` and installs deterministic capture tooling (added in #263/#265):

- **In-page automation API** on `window.__pxlblz` (only present under `?capture`):
  - `setPreview(patch)` — merges a partial into the preview store, firing the deck control effects so a *paused* preview repaints (e.g. `setPreview({ brightness: 0.5, diffusion: 0.3 })`).
  - `capture(name = 'capture.png')` — forces a fresh paint on the next macrotask (so any setState-driven control effects flush first), snapshots the frame from *inside* `paint()`, POSTs it, and resolves once saved.
- **Capture sink**: `POST /__capture?name=foo.png` (Vite dev-server endpoint) writes the posted PNG bytes to `/tmp/pxlblz-captures/`. Never registered in a production build.

Prefer this path over out-of-band canvas readback (`drawImage`/`toBlob` from outside), which catches the buffer at unpredictable moments and can return stale or cleared frames.

### Code search (Morph)

For exploratory "where/how does X work" questions, prefer the Morph `codebase_search` tool (`mcp__morph-mcp__codebase_search`) over grepping and reading files yourself. It runs the grep/read work in a separate subagent and returns only the curated, relevant excerpts — keeping the main context lean. Pass a natural-language question (not a regex or symbol dump) and the repo path. Use direct file tools (Read/Grep/Glob) when you already know the exact file or symbol.

## Commands

```bash
npm run dev          # start Vite dev server
npm test             # run full test suite (Vitest, one-shot)
npm run test:watch   # Vitest in watch mode
npm run build        # tsc + Vite build
npx tsc --noEmit     # type-check only
```

To run a single test file:
```bash
npx vitest run src/store/previewStore.test.ts
```

The pre-commit hook runs `npm test` automatically via Husky.

## Architecture

### Engine / UI boundary

The codebase enforces a hard split between engine code and UI code:

- **Engine** (`src/engine/`, coming) — pure TypeScript, zero React imports. Exposes functions and Zustand store slices. Covers: transpiler, runtime shim, eval loop, canvas renderer, IndexedDB storage.
- **UI** (`src/`, React components) — calls engine functions, reads from Zustand stores. No business logic inline.

Enforce this by checking for React imports: engine files must have none.

### State (Zustand stores)

Three stores live in `src/store/`:

| Store | State |
|---|---|
| `previewStore` | `isRunning`, `speed`, `brightness`, `grid` config |
| `patternStore` | `activePatternId` |
| `editorStore` | `compileStatus` (`'good' \| 'broken'`) |

Each store exports its initial state as `*InitialState` — use `store.setState(initialState)` (merge, not replace) in `beforeEach` to reset between tests.

### Testing conventions

- Store tests: reset with `useXxxStore.setState(xxxInitialState)` (merge mode — no second `true` arg, which would drop actions).
- Test setup is in `src/test/setup.ts` (imports `@testing-library/jest-dom`).
- Vitest globals are enabled; no need to import `describe`/`it`/`expect` explicitly.
- React component tests are smoke-only. Engine logic is the primary test target.

### Transpiler (Phase 2, not yet built)

When built, `bundle(patternSrc)` will return `{ code, metadata }`:
- `code` — flat JS artifact, used for both browser eval and hardware download.
- `metadata` — `{ exportedVars, controls, renderFns }`, preview-side only, never sent to hardware.

Library files go under `src/pixelblaze/lib/` as plain `.js` (not `.ts`) — Acorn parses them directly and they must be valid Pixelblaze dialect. The filename is the namespace (`sdf.js` → `sdf.*`).

### Key constraints

- **Faithful fixed-point preview** (Tech Reference §2/§5): the preview *defaults* to emulating the device's 16.16 fixed-point arithmetic (Precise), with a float64 "Fast" escape hatch. Two divergence classes are accepted: transcendental precision and algorithmic identity (`perlin`/`prng`/`wave`); only pure integer arithmetic is bit-identical.
- **Main thread execution** (Tech Reference §17): patterns run on the main thread via `new Function()` + rAF. A syntactically valid infinite loop freezes the tab. The periodic-sync-tick gate (not per-keystroke eval) reduces but does not eliminate this risk.

## Key docs

- **As-built reference**: `docs/reference/PXLBLZ Technical Reference.md` — authoritative description of how the system is built (engine internals, maps, fidelity, connectivity)
- **Feature guide**: `docs/reference/PXLBLZ Feature Guide.md` — the user-facing view of what the IDE does
- **Domain glossary**: `CONTEXT.md`

## Agent skills

### Issue tracker

Issues live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` at root. The Technical Reference (`docs/reference/PXLBLZ Technical Reference.md`) is the authoritative record of design decisions and their rationale. See `docs/agents/domain.md`.
