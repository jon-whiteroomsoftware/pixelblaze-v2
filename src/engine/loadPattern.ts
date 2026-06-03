// Which render functions a pattern defines. Threaded from bundle() so the
// runtime can dispatch by dimensionality and the UI can label the pattern.
export interface RenderFns {
  hasBeforeRender: boolean
  hasRender2D: boolean
  hasRender: boolean
  hasRender3D: boolean
}

export interface PatternMetadata {
  exportedVars: string[]
  patternVars: string[]  // all top-level var declarations, exported or not
  controls: {
    exportName: string
    kind: string
    label: string
    // Curated, end-user-facing description of what the control does. Filled in
    // for demo controls by withControlDescriptions() at the demo-loading layer
    // (issue #190); bundle() never sets it, so user/imported patterns fall back
    // to the humanized label.
    description?: string
    // For pickers only: the top-level vars backing each arg (h,s,v or r,g,b),
    // in arg order. Lets the UI seed the swatch from the pattern's init values.
    pickerVars?: string[]
  }[]
  // Present when produced by bundle(); absent in hand-built test metadata.
  renderFns?: RenderFns
}

export interface PatternHandle {
  beforeRender: (delta: number) => void
  // Dimensional render slots. Each dispatches at its own dimensionality and
  // falls back down the chain render3D -> render2D -> render -> noop, so asking
  // for a higher dimension than the pattern defines drops the extra coords.
  render: (index: number) => void
  render2D: (index: number, x: number, y: number) => void
  render3D: (index: number, x: number, y: number, z: number) => void
  getExports: () => Record<string, unknown>
  controls: Record<string, (...args: number[]) => void>
}

// A pattern's native dimensionality is the highest render fn it defines:
// render3D -> 3, render2D -> 2, render -> 1. Drives the default layout picked
// on open and the title-bar label (not per-frame dispatch). Patterns defining
// no render fn fall back to 2 (the historical preview default).
export function nativeDimension(renderFns: RenderFns | undefined): 1 | 2 | 3 {
  if (!renderFns) return 2
  if (renderFns.hasRender3D) return 3
  if (renderFns.hasRender2D) return 2
  if (renderFns.hasRender) return 1
  return 2
}

export function loadPattern(
  code: string,
  metadata: PatternMetadata,
  builtins: Record<string, unknown>,
): PatternHandle {
  const stripped = code.replace(/\bexport\s+/g, '')
  const epilogue = buildEpilogue(metadata)
  const paramNames = Object.keys(builtins)
  const paramValues = Object.values(builtins)
  const factory = new Function(...paramNames, `${stripped}\n${epilogue}`)
  return factory(...paramValues) as PatternHandle
}

function buildEpilogue(metadata: PatternMetadata): string {
  // getExports reads all top-level vars so the watcher can inspect any of them
  const getExportsEntries = metadata.patternVars
    .map(v => `${JSON.stringify(v)}:(typeof ${v}!=='undefined'?${v}:undefined)`)
    .join(',')

  const controlsEntries = metadata.controls
    .map(c => `${JSON.stringify(c.exportName)}:(typeof ${c.exportName}==='function'?${c.exportName}:function(){})`)
    .join(',')

  return [
    'return {',
    '  beforeRender:typeof beforeRender==="function"?beforeRender:function(delta){},',
    // Dimensional render slots with the fallback chain render3D -> render2D -> render -> noop.
    '  render:typeof render==="function"?render:function(index){},',
    '  render2D:typeof render2D==="function"?render2D:(typeof render==="function"?function(index,x,y){render(index);}:function(index,x,y){}),',
    '  render3D:typeof render3D==="function"?render3D:(typeof render2D==="function"?function(index,x,y,z){render2D(index,x,y);}:(typeof render==="function"?function(index,x,y,z){render(index);}:function(index,x,y,z){})),',
    `  getExports:function(){return{${getExportsEntries}};},`,
    `  controls:{${controlsEntries}},`,
    '};',
  ].join('\n')
}
