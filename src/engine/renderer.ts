import {
  canvasSize,
  clampGridDim,
  clampPixelCount,
  MAX_PIXEL_COUNT,
  pointSize,
  point3DSize,
  projectIndex,
  projectPos,
  projectOrbit,
  orbitDepthToClipZ,
  depthCue,
  fit3DScale,
  modelHalfExtent,
  FIT_3D_MARGIN,
  DEFAULT_ORBIT,
  type OrbitCamera,
  type Locked2DGrid,
} from './camera'

export interface RendererGridConfig {
  rows: number
  cols: number
  spacing: number
  // Preview light size (ADR-0006): the drawn source diameter as a fraction of
  // the inter-dot pitch. Scales the dots only, never the canvas size. Defaults
  // to touching (1) as a backstop; the preview always supplies the real value.
  lightSize?: number
}

function clampGrid<T extends RendererGridConfig>(grid: T): T {
  return { ...grid, rows: clampGridDim(grid.rows), cols: clampGridDim(grid.cols) }
}

export interface Renderer {
  paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void
  updateGrid(grid: RendererGridConfig): void
  // Drive the draw positions from a viewport shape embedding (1D line/ring) given
  // as normalized [0,1]² `pos` per index, or `null` to fall back to the locked-2D
  // grid (`projectIndex`). The grid path is left untouched when null, so the
  // reveal-2D plane is bit-for-bit unchanged.
  setShapePositions(positions: [number, number][] | null): void
  // Switch to the 3D orbit path: draw positions come from normalized [0,1]³ `pos`
  // projected through the orbit camera each paint, with depth cueing. `null`
  // leaves 3D mode (back to the 2D grid/shape path). Sizes the canvas to a square
  // `canvasPx`; `side` is the lattice's points-per-axis, used to anchor the
  // light-source diameter to the lattice pitch.
  set3DPositions(
    positions: [number, number, number][] | null,
    opts?: { canvasPx?: number; side?: number },
  ): void
  // Update the orbit camera (auto-orbit advance, drag, reset). No-op in 2D mode.
  setCamera(camera: OrbitCamera): void
}

const DIM_FACTOR = 0.15

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec3 a_color;
attribute float a_size;
attribute float a_depth;
varying vec3 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_pos, a_depth, 1.0);
  gl_PointSize = a_size;
}
`

// Circular dot: discard fragments outside the point's inscribed circle so the
// gl.POINTS quad reads as a round LED, matching the legacy ctx.arc() output.
const FRAG_SRC = `
precision mediump float;
varying vec3 v_color;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(v_color, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT_SRC))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC))
  gl.linkProgram(program)
  return program
}

export function createRenderer(canvas: HTMLCanvasElement, initialGrid: RendererGridConfig): Renderer {
  let grid = clampGrid(initialGrid)
  // Glowing LEDs are additive light, so the draw uses additive blending — which
  // is order-independent, so there is no painter's-order depth sort. The CSS
  // `diffusion` blur is applied as a filter on this canvas by the UI layer.
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })

  function applySize(): void {
    const { width, height } = canvasSize(grid)
    canvas.width = width
    canvas.height = height
  }

  applySize()

  // jsdom and some test environments don't provide a WebGL context. Degrade to
  // a no-op renderer that still tracks size, exactly as the Canvas-2D renderer
  // did without a 2D context.
  if (!gl) {
    return {
      paint: () => undefined,
      updateGrid(newGrid) { grid = clampGrid(newGrid); applySize() },
      setShapePositions: () => undefined,
      set3DPositions: () => undefined,
      setCamera: () => undefined,
    }
  }

  const program = createProgram(gl)
  const posBuffer = gl.createBuffer()!
  const colorBuffer = gl.createBuffer()!
  const sizeBuffer = gl.createBuffer()!
  const depthBuffer = gl.createBuffer()!
  const aPos = gl.getAttribLocation(program, 'a_pos')
  const aColor = gl.getAttribLocation(program, 'a_color')
  const aSize = gl.getAttribLocation(program, 'a_size')
  const aDepth = gl.getAttribLocation(program, 'a_depth')

  // 2D positions depend only on the grid, not the frame, so they're rebuilt on
  // grid change rather than per paint. `positions` is the clip-space (x,y) per
  // drawable index; `drawCount` is how many of those we actually draw.
  let positions = new Float32Array(0)
  let sizes = new Float32Array(0)
  // Per-vertex clip-space z, written only in 3D mode to drive opaque depth-tested
  // occlusion (nearer orbs hide farther ones). 2D draws at a constant z via
  // a_depth's generic attribute, so this stays empty there.
  let depths = new Float32Array(0)
  let drawCount = 0
  // When set, draw positions come from a viewport shape embedding (1D path)
  // rather than the locked-2D grid. Null keeps the legacy grid path.
  let shapePos: [number, number][] | null = null
  // When set, the renderer is in 3D orbit mode: positions/sizes are recomputed
  // per paint from `pos3D` + `camera`. Takes precedence over the 2D paths.
  let pos3D: [number, number, number][] | null = null
  let camera: OrbitCamera = DEFAULT_ORBIT
  // Points-per-axis of the active 3D lattice, used to anchor the light-source
  // diameter to the projected lattice pitch. Set by set3DPositions.
  let lattice3DSide = 1
  // The active model's bounding-sphere radius about the rotation centre, so the
  // fit (and depth) zoom to the model's true extent — a thin pole fills the frame
  // just as a full cube does. Set by set3DPositions.
  let lattice3DHalfExtent = 0.5 * Math.sqrt(3)

  function rebuildPositions(): void {
    const coords: number[] = []
    if (shapePos) {
      const cap = Math.min(shapePos.length, MAX_PIXEL_COUNT)
      for (let i = 0; i < cap; i++) {
        const [x, y] = projectPos(shapePos[i])
        coords.push(x, y)
      }
    } else {
      const cap = Math.min(grid.rows * grid.cols, MAX_PIXEL_COUNT)
      for (let i = 0; i < cap; i++) {
        const clip = projectIndex(i, grid)
        if (!clip) break
        coords.push(clip[0], clip[1])
      }
    }
    positions = new Float32Array(coords)
    drawCount = coords.length / 2
    sizes = new Float32Array(drawCount).fill(pointSize(grid, grid.lightSize ?? 1))
    gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.STATIC_DRAW)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, sizeBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, sizes, gl!.STATIC_DRAW)
  }

  rebuildPositions()

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.clearColor(0, 0, 0, 1)

  const colors = () => new Float32Array(drawCount * 3)
  let colorData = colors()

  // Recompute per-vertex clip positions and sizes from the live camera, and
  // return the per-vertex brightness multiplier (folded into colour at paint).
  // No depth sort — additive blend is order-independent (#129).
  function project3D(): Float32Array {
    if (!pos3D) return new Float32Array(0)
    const cap = Math.min(pos3D.length, MAX_PIXEL_COUNT)
    drawCount = cap
    if (positions.length !== cap * 2) positions = new Float32Array(cap * 2)
    if (sizes.length !== cap) sizes = new Float32Array(cap)
    if (depths.length !== cap) depths = new Float32Array(cap)
    const bright = new Float32Array(cap)
    // Base orb diameter is anchored to the projected lattice pitch via light
    // size (ADR-0006), the 3D analogue of the 2D pointSize; depth cueing then
    // scales it per-dot (nearer = larger). Diffusion never touches it — the blur
    // that merges sources is a CSS filter applied by the UI layer.
    const scale = fit3DScale(FIT_3D_MARGIN, lattice3DHalfExtent)
    const baseSize = point3DSize(canvas.width, lattice3DSide, grid.lightSize ?? 1, scale)
    for (let i = 0; i < cap; i++) {
      const { clip, depth } = projectOrbit(pos3D[i], camera, scale)
      const cue = depthCue(depth, {}, lattice3DHalfExtent)
      positions[i * 2] = clip[0]
      positions[i * 2 + 1] = clip[1]
      depths[i] = orbitDepthToClipZ(depth, lattice3DHalfExtent)
      sizes[i] = Math.max(1, baseSize * cue.sizeMul)
      bright[i] = cue.brightnessMul
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.DYNAMIC_DRAW)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, sizeBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, sizes, gl!.DYNAMIC_DRAW)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, depthBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, depths, gl!.DYNAMIC_DRAW)
    return bright
  }

  function paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void {
    const bright3D = pos3D ? project3D() : null
    const count = Math.min(drawCount, pixels.length, clampPixelCount(pixels.length))
    if (colorData.length !== drawCount * 3) colorData = colors()

    const dimScale = dimmed ? DIM_FACTOR : 1
    // Faithful intensity in BOTH dimensions: each source shows at brightness×color
    // (ADR-0006 — the priority invariant is dimension parity: switching a 2D
    // pattern to a 3D one at identical settings must not change perceived
    // brightness, and at diffusion 0 sources must read as crisp and distinct).
    // No light-size energy compensation: 2D is a single non-overlapping layer
    // that would only be dimmed by it, and 3D now renders OPAQUE (depth-tested,
    // below) rather than additively blending — so there is no overlap to tame.
    // Light size changes only the drawn diameter; brightness is the sole control
    // over brightness. Depth cueing still shades the cube per-vertex for legibility.
    const scale = brightness * dimScale
    for (let i = 0; i < count; i++) {
      const [r, g, b] = pixels[i]
      // Depth cueing multiplies brightness per-vertex in 3D mode (nearer = brighter).
      const ds = scale * (bright3D ? bright3D[i] : 1)
      colorData[i * 3] = clamp01(r * ds)
      colorData[i * 3 + 1] = clamp01(g * ds)
      colorData[i * 3 + 2] = clamp01(b * ds)
    }

    const ctx = gl as WebGLRenderingContext
    ctx.viewport(0, 0, canvas.width, canvas.height)
    // 3D draws OPAQUE light sources: depth test on (nearer occludes farther),
    // additive blend off — so overlapping orbs read as solid, crisp sources
    // instead of summing into a translucent, washed-out field. 2D/1D is a single
    // non-overlapping layer with no depth, so it keeps the order-independent
    // additive blend and skips the depth test.
    if (pos3D) {
      ctx.disable(ctx.BLEND)
      ctx.enable(ctx.DEPTH_TEST)
      ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT)
    } else {
      ctx.disable(ctx.DEPTH_TEST)
      ctx.enable(ctx.BLEND)
      ctx.clear(ctx.COLOR_BUFFER_BIT)
    }
    ctx.useProgram(program)

    ctx.bindBuffer(ctx.ARRAY_BUFFER, posBuffer)
    ctx.enableVertexAttribArray(aPos)
    ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0)

    ctx.bindBuffer(ctx.ARRAY_BUFFER, sizeBuffer)
    ctx.enableVertexAttribArray(aSize)
    ctx.vertexAttribPointer(aSize, 1, ctx.FLOAT, false, 0, 0)

    // Per-vertex clip-space z in 3D; a constant 0 plane in 2D (attribute array
    // disabled, so all vertices read the generic a_depth value).
    if (pos3D) {
      ctx.bindBuffer(ctx.ARRAY_BUFFER, depthBuffer)
      ctx.enableVertexAttribArray(aDepth)
      ctx.vertexAttribPointer(aDepth, 1, ctx.FLOAT, false, 0, 0)
    } else {
      ctx.disableVertexAttribArray(aDepth)
      ctx.vertexAttrib1f(aDepth, 0)
    }

    ctx.bindBuffer(ctx.ARRAY_BUFFER, colorBuffer)
    ctx.bufferData(ctx.ARRAY_BUFFER, colorData, ctx.DYNAMIC_DRAW)
    ctx.enableVertexAttribArray(aColor)
    ctx.vertexAttribPointer(aColor, 3, ctx.FLOAT, false, 0, 0)

    ctx.drawArrays(ctx.POINTS, 0, count)
  }

  function updateGrid(newGrid: RendererGridConfig): void {
    grid = clampGrid(newGrid)
    if (pos3D) return // 3D mode owns its own square canvas size
    applySize()
    rebuildPositions()
    colorData = colors()
  }

  function setShapePositions(p: [number, number][] | null): void {
    shapePos = p
    rebuildPositions()
    colorData = colors()
  }

  function set3DPositions(
    p: [number, number, number][] | null,
    opts: { canvasPx?: number; side?: number } = {},
  ): void {
    pos3D = p
    if (p) {
      // Anchor the orb diameter to the lattice pitch: prefer the caller's `side`,
      // else recover it as the cube root of the point count (count = side³).
      lattice3DSide = opts.side ?? Math.max(1, Math.round(Math.cbrt(p.length)))
      lattice3DHalfExtent = modelHalfExtent(p)
      if (opts.canvasPx) {
        const px = Math.max(1, Math.round(opts.canvasPx))
        canvas.width = px
        canvas.height = px
      }
      drawCount = Math.min(p.length, MAX_PIXEL_COUNT)
      colorData = colors()
    } else {
      // Leaving 3D mode: restore the 2D canvas + positions.
      applySize()
      rebuildPositions()
      colorData = colors()
    }
  }

  function setCamera(c: OrbitCamera): void {
    camera = c
  }

  return { paint, updateGrid, setShapePositions, set3DPositions, setCamera }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export type { Locked2DGrid }
