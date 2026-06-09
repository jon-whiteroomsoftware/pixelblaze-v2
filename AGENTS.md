# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Environment notes

This project lives under a path containing spaces (Google Drive folder). Never warn about embedded spaces in paths when running commands within this project directory.

### Preview screenshots / browser automation (`?capture`)

This project is configured around a long-lived Vite dev server on port `5174`. Prefer using the existing server at `http://localhost:5174/` (or `http://localhost:5174/?capture`) for browser checks. Do not casually start and stop per-task dev servers; hot reload is reliable and the persistent server is part of the normal workflow. If the server is not responding, report that and only start it when needed.

The WebGL preview render loop keeps the page perpetually busy, so naive screenshot tools time out and the canvas drawing buffer is unreadable by default. When you need to screenshot the app — and especially the preview renderer — load the dev server with the `?capture` query param (e.g. `http://localhost:5174/?capture`). This is dev-only and inert without the param. It enables `preserveDrawingBuffer` and installs deterministic capture tooling (added in #263/#265):

- **In-page automation API** on `window.__pxlblz` (only present under `?capture`):
  - `setPreview(patch)` — merges a partial into the preview store, firing the deck control effects so a *paused* preview repaints (e.g. `setPreview({ brightness: 0.5, diffusion: 0.3 })`).
  - `capture(name = 'capture.png')` — forces a fresh paint on the next macrotask (so any setState-driven control effects flush first), snapshots the frame from *inside* `paint()`, POSTs it, and resolves once saved.
- **Capture sink**: `POST /__capture?name=foo.png` (Vite dev-server endpoint) writes the posted PNG bytes to `/tmp/pxlblz-captures/`. Never registered in a production build.

Prefer this path over out-of-band canvas readback (`drawImage`/`toBlob` from outside), which catches the buffer at unpredictable moments and can return stale or cleared frames.

### Code search (Morph / Warp Grip)

For code exploration, use Morph Warp Grip first. In Codex this is exposed as `mcp__morph_mcp.codebase_search`; pass the repo path and a natural-language question. It runs grep/read work in a separate subagent and returns curated excerpts, which keeps the main context lean.

Default to Warp Grip for "where/how does X work?", architecture tracing, feature discovery, bug investigation, and any search where the exact file or symbol is not already known. Do not start with `rg`, `grep`, broad `find`, or manual file reading for those tasks.

Use direct shell/file search only when there is a specific good reason: checking whether an exact literal string exists, listing known files, opening a file already identified by Morph, or performing a small mechanical verification after Morph has found the relevant area. If direct search is used for exploration anyway, pause first and state why Warp Grip is not the better tool for that query.

## Commands

```bash
npm run dev          # start the long-lived Vite dev server on port 5174 if it is not already running
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
- **Main thread execution** (Tech Reference §16): patterns run on the main thread via `new Function()` + rAF. A syntactically valid infinite loop freezes the tab. The periodic-sync-tick gate (not per-keystroke eval) reduces but does not eliminate this risk.

## Key docs

- **As-built reference**: `docs/reference/PXLBLZ Technical Reference.md` — authoritative description of how the system is built (engine internals, maps, fidelity, connectivity)
- **Feature guide**: `docs/reference/PXLBLZ Feature Guide.md` — the user-facing view of what the IDE does
- **Domain glossary**: `CONTEXT.md`
- **Forward-looking plans**: `docs/plans/`

## Agent skills

### Issue tracker

Issues live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage and coordination labels are mapped in `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` at root. The Technical Reference (`docs/reference/PXLBLZ Technical Reference.md`) is the authoritative record of design decisions and their rationale. See `docs/agents/domain.md`.

### Documentation cadence

Use the `doc-sweep` skill when a commit, issue, or feature completion needs
`CONTEXT.md`, `docs/plans/`, and `docs/reference/` brought back into sync.
