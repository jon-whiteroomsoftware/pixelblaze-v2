# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Key ADR constraints

- **Float64, not fixed-point** (ADR-0001): the preview runs patterns as native JS float64. No fixed-point emulation. Patterns using bitwise tricks or overflow will differ from hardware — accepted divergence.
- **Main thread execution** (ADR-0002): patterns run on the main thread via `new Function()` + rAF. A syntactically valid infinite loop freezes the tab. The periodic-sync-tick gate (not per-keystroke eval) reduces but does not eliminate this risk.

## Key docs

- **PRD**: `docs/prd/Pixelblaze IDE v2 PRD.md` — full feature list, phased build order, architecture decisions, and deferred scope
- **Domain glossary**: `CONTEXT.md`
- **ADRs**: `docs/adr/`

## Agent skills

### Issue tracker

Issues live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` + `docs/adr/` at root. See `docs/agents/domain.md`.
