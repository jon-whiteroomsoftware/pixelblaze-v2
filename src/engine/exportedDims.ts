// Which render dimensions a pattern source DEFINES — for the dimension cue shown
// next to a pattern/demo in the list (and elsewhere). Unlike `nativeDimension`
// (the single highest render fn, used for dispatch/default-layout), a pattern can
// define several render fns, and the list shows all of them: a pattern with both
// `render` and `render3D` reads "1D | 3D".
//
// Lightweight + total: a regex scan that never throws (the list renders many
// untrusted sources at once), matching both `function renderXX(` declarations and
// `renderXX = function` / `renderXX = (…) =>` assignments, with or without
// `export`. `render` is anchored so it does not match `render2D`/`render3D`.

const DIM_FNS: { dim: 1 | 2 | 3; name: string }[] = [
  { dim: 1, name: 'render' },
  { dim: 2, name: 'render2D' },
  { dim: 3, name: 'render3D' },
]

function definesFn(src: string, name: string): boolean {
  // `name` must be followed by `(` (declaration) or `=` (assignment), never by a
  // digit/letter — so `render` does not swallow `render2D`.
  const decl = new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
  const assign = new RegExp(`\\b${name}\\s*=\\s*(?:function|\\()`)
  return decl.test(src) || assign.test(src)
}

// The render dimensions a source defines, ascending. Empty when none are defined.
export function exportedDims(src: string): (1 | 2 | 3)[] {
  return DIM_FNS.filter((f) => definesFn(src, f.name)).map((f) => f.dim)
}

// The list cue for a source: "2D", or "1D | 3D" when several. Empty string when
// the source defines no render fn (nothing to show).
export function dimLabel(src: string): string {
  return exportedDims(src)
    .map((d) => `${d}D`)
    .join(' | ')
}
