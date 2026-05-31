import * as acorn from 'acorn'
import type { MapRecord } from '../storage'
import { STOCK_MAP_SPECS } from './stockCatalogue'

// The editor "map mode" authoring layer (#151, ADR-0008). A custom map's source
// is plain JavaScript — a single anonymous `function(pixelCount){ … return
// coords }` expression, exactly what a real Pixelblaze Mapper tab evaluates — so
// this layer uses a *parse-only* JS check (no fixed-point shim, no dialect
// walker) and never evaluates anything. Evaluating/baking the source is #143.

export interface ParseError {
  message: string
  line: number // 1-based
  column: number // 0-based
}

// The default working skeleton a fresh New Map opens on: a minimal valid map
// source returning a short 2D line. Valid plain JS, ready to edit or replace via
// the "Load template" dropdown. Not yet evaluated/rendered (that is #143).
export const MAP_SKELETON = `function(pixelCount) {
  var coords = []
  for (var i = 0; i < pixelCount; i++) {
    coords.push([i, 0])
  }
  return coords
}`

// Parse-only validity check for a map source. The canonical source is an
// anonymous function *expression*, which is not a valid top-level statement on
// its own, so we wrap it in parens (mirroring how `evalMapSource` evaluates
// `(${source})`) and parse as plain JS — no dialect rules. Returns [] when the
// source parses, or a single positioned error when it does not. Drives the
// parse-only compile badge and Monaco markers.
export function parseMapSource(source: string): ParseError[] {
  try {
    acorn.parse(`(${source})`, { ecmaVersion: 2020, sourceType: 'script', locations: true })
    return []
  } catch (e) {
    const err = e as { message: string; loc?: { line: number; column: number } }
    return [
      {
        message: stripAcornSuffix(err.message),
        // The wrapping `(` lives on line 1 col 0; the source starts at col 1, so
        // shift the reported column back by one on line 1 to point into the user's
        // text. Later lines are unshifted (the prefix is single-char).
        line: err.loc?.line ?? 1,
        column: Math.max(0, (err.loc?.column ?? 0) - (err.loc?.line === 1 ? 1 : 0)),
      },
    ]
  }
}

// Acorn appends " (line:col)" to its messages; drop it — the position is carried
// structurally. Mirrors validate.ts's stripAcornSuffix.
function stripAcornSuffix(message: string): string {
  return message.replace(/\s*\(\d+:\d+\)\s*$/, '')
}

// A map record is openable in the editor only if it carries authoring source.
// Stock maps are source-backed at runtime but never persist a record, so a
// persisted record with no `source` (or a future legacy row) is not openable.
export function isMapOpenable(record: Pick<MapRecord, 'source'>): boolean {
  return typeof record.source === 'string'
}

// The dirty-guard predicate (#151): a buffer is pristine vs. its last-loaded
// baseline when byte-identical. The New Map "Load template" path swaps silently
// while pristine and confirms before overwriting once edited.
export function isPristineToBaseline(buffer: string, baseline: string): boolean {
  return buffer === baseline
}

export interface MapTemplate {
  id: string
  name: string
  source: string
}

// The "Load template" dropdown options: each source-backed stock map paired with
// its verbatim source. The dropdown loads the source *text only* — not the
// template's name or dimensionality (#151). This is the only way to view a stock
// map's code; stock maps stay non-openable in place.
export function mapTemplates(): MapTemplate[] {
  return STOCK_MAP_SPECS.map((s) => ({ id: s.id, name: s.name, source: s.source }))
}
