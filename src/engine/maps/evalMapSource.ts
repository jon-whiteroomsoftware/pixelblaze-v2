// The no-shim map-source evaluator (ADR-0008). A stock or custom map's authoring
// source is a single top-level `function(pixelCount){ … return coords }` written
// in plain JavaScript — the exact thing a real Pixelblaze Mapper tab evaluates in
// the browser. We run it the same way the device's browser does: a bare
// `new Function`, float64, with NO fixed-point shim wrapper (that layer is for
// patterns only). `Math` and language built-ins are in scope; there are no IDE
// helpers, no library namespaces, no pattern globals.

// Evaluate a map source for the requested pixel count and return its RAW
// coordinate array (natural-unit geometry — the shared normalize pass maps it to
// [0,1] afterwards). Throws a descriptive error if the source is not a function
// or does not return a non-empty array of equal-arity numeric coords.
export function evalMapSource(source: string, pixelCount: number): number[][] {
  let factory: (n: number) => unknown
  try {
    // `return (<source>)` so the function expression is the evaluated value.
    factory = new Function(`return (${source})`)() as (n: number) => unknown
  } catch (e) {
    throw new Error(`map source failed to compile: ${(e as Error).message}`)
  }
  if (typeof factory !== 'function') {
    throw new Error('map source must be a single function(pixelCount){ … }')
  }
  let raw: unknown
  try {
    raw = factory(pixelCount)
  } catch (e) {
    throw new Error(`map source threw while generating: ${(e as Error).message}`)
  }
  if (!Array.isArray(raw)) {
    throw new Error('map source must return an array of coordinates')
  }
  const coords: number[][] = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (!Array.isArray(c) || c.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error(`map source coord ${i} is not an array of finite numbers`)
    }
    coords.push(c as number[])
  }
  return coords
}
