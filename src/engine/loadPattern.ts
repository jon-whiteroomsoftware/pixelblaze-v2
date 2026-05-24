export interface PatternMetadata {
  exportedVars: string[]
  controls: { exportName: string; kind: string; label: string }[]
}

export interface PatternHandle {
  beforeRender: (delta: number) => void
  render2D: (index: number, x: number, y: number) => void
  getExports: () => Record<string, unknown>
  controls: Record<string, (value: number | number[]) => void>
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
  const getExportsEntries = metadata.exportedVars
    .map(v => `${JSON.stringify(v)}:(typeof ${v}!=='undefined'?${v}:undefined)`)
    .join(',')

  const controlsEntries = metadata.controls
    .map(c => `${JSON.stringify(c.exportName)}:(typeof ${c.exportName}==='function'?${c.exportName}:function(){})`)
    .join(',')

  return [
    'return {',
    '  beforeRender:typeof beforeRender==="function"?beforeRender:function(delta){},',
    // Fall back to 1D render(index) if render2D is not defined
    '  render2D:typeof render2D==="function"?render2D:(typeof render==="function"?function(index,x,y){render(index);}:function(index,x,y){}),',
    `  getExports:function(){return{${getExportsEntries}};},`,
    `  controls:{${controlsEntries}},`,
    '};',
  ].join('\n')
}
