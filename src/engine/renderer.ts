import {
  canvasSize,
  clampGridDim,
  clampPixelCount,
  MAX_PIXEL_COUNT,
  pointSize,
  point3DSize,
  diffusionGlow,
  nearestNeighborSpacing,
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
  // `canvasPx`. The light-source diameter is anchored to the layout's MEASURED
  // nearest-neighbour spacing (computed from `positions`), so it is correct for
  // any layout — solid cube, sphere shell, helix, or wrapped pole (#63).
  set3DPositions(
    positions: [number, number, number][] | null,
    opts?: { canvasPx?: number },
  ): void
  // Update the orbit camera (auto-orbit advance, drag, reset). No-op in 2D mode.
  setCamera(camera: OrbitCamera): void
  // Set the diffusion amount (0–1). Diffusion grows a soft glow tail around each
  // light source's solid core to merge neighbours like a physical diffuser, never
  // resizing the core and never dimming (ADR-0006). Recomputes 2D quad sizes in
  // place; 3D consumes it per paint.
  setDiffusion(diffusion: number): void
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

// Per-source light kernel (ADR-0006, revised). The gl.POINTS quad is grown beyond
// the solid core to hold the diffusion glow; `q` is the fragment's radius as a
// fraction of the quad half-width (0 at centre, 1 at the inscribed-circle rim).
//   - q > 1                discarded (outside the round LED).
//   - q <= u_coreFrac      the solid core, full peak amplitude u_peak.
//   - otherwise            the raised-cosine (Hann) tail: u_peak at the core edge,
//                          easing to 0 at the rim (a physical diffuser's spread).
// As diffusion rises the core dissolves (u_coreFrac → 0) so the whole source becomes
// one smooth bump that fuses with its neighbours; u_peak is normalised so the
// brightest point holds steady (never dims, never blows out — see diffusionGlow).
// u_mode selects the draw pass so 3D can render the (shrinking) opaque cores then
// add the tail: 0 = full (2D/1D, one additive pass)  1 = core only  2 = tail only.
// At diffusion 0, coreFrac is 1 and peak 1, so this is a solid disc — bit-for-bit
// the legacy ctx.arc() / inscribed-circle output.
const FRAG_SRC = `
precision mediump float;
varying vec3 v_color;
uniform float u_coreFrac;
uniform float u_peak;
uniform int u_mode;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float q = length(d) * 2.0;
  if (q > 1.0) discard;
  float intensity;
  if (q <= u_coreFrac) {
    if (u_mode == 2) discard; // tail pass skips the solid core
    intensity = u_peak;
  } else {
    if (u_mode == 1) discard; // core pass skips the tail
    float s = (q - u_coreFrac) / max(1e-4, 1.0 - u_coreFrac);
    float f = 0.5 * (1.0 + cos(3.14159265 * s));
    intensity = u_peak * f;
  }
  gl_FragColor = vec4(v_color * intensity, 1.0);
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
      setDiffusion: () => undefined,
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
  const uCoreFrac = gl.getUniformLocation(program, 'u_coreFrac')
  const uPeak = gl.getUniformLocation(program, 'u_peak')
  const uMode = gl.getUniformLocation(program, 'u_mode')

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
  // Diffusion amount (0–1) and the kernel params it resolves to for the active
  // mode. `coreFrac`/`peak` are frame-uniform (one diffusion + one pitch per
  // layout), so the shader reads them as uniforms; only the per-vertex quad size
  // differs (depth-cued in 3D). Updated by setDiffusion (2D) / project3D (3D).
  let diffusion = 0
  let coreFrac = 1
  let peak = 1
  // Measured normalized nearest-neighbour spacing of the active 3D layout, used
  // to anchor the light-source diameter to the real on-screen neighbour gap (so
  // it is right for a cube, sphere, helix, or pole alike). Set by set3DPositions.
  let lattice3DSpacing = 0
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
    gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuffer)
    gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.STATIC_DRAW)
    apply2DGlow()
  }

  // Resolve the 2D glow kernel from the current diffusion + pitch and upload the
  // (uniform) per-vertex quad size. The solid core is the light-size disc; the
  // diffusion tail grows the quad around it without moving the core (ADR-0006).
  function apply2DGlow(): void {
    const core = pointSize(grid, grid.lightSize ?? 1)
    const glow = diffusionGlow(diffusion, core, grid.spacing)
    coreFrac = glow.coreFrac
    peak = glow.peak
    sizes = new Float32Array(drawCount).fill(glow.quadDiameterPx)
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
    const ls = grid.lightSize ?? 1
    const baseSize = point3DSize(canvas.width, lattice3DSpacing, ls, scale)
    // Grow the orb quad to hold the diffusion glow tail (the core stays baseSize);
    // pitch = baseSize / lightSize is the measured on-screen neighbour gap. Drawn
    // as opaque cores + an additive tail pass (paint), so 3D never washes out.
    const pitch = ls > 0 ? baseSize / ls : baseSize
    const glow = diffusionGlow(diffusion, baseSize, pitch)
    coreFrac = glow.coreFrac
    peak = glow.peak
    for (let i = 0; i < cap; i++) {
      const { clip, depth } = projectOrbit(pos3D[i], camera, scale)
      const cue = depthCue(depth, {}, lattice3DHalfExtent)
      positions[i * 2] = clip[0]
      positions[i * 2 + 1] = clip[1]
      depths[i] = orbitDepthToClipZ(depth, lattice3DHalfExtent)
      sizes[i] = Math.max(1, glow.quadDiameterPx * cue.sizeMul)
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
    ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT)
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

    ctx.uniform1f(uCoreFrac, coreFrac)
    ctx.uniform1f(uPeak, peak)

    if (pos3D) {
      // 3D in two passes (ADR-0006): opaque cores first (depth test on, blend off)
      // so nearer orbs occlude farther — crisp, solid sources, never a washed-out
      // additive haze at diffusion 0. Then, when diffusing, an ADDITIVE glow-tail
      // pass on top (depth-test read-only, no depth write) fills the inter-orb gaps
      // to merge them. As diffusion rises the opaque core shrinks (coreFrac → 0) so
      // the cube dissolves from crisp orbs into one smooth volumetric glow — light is
      // only ADDED into the gaps, so the field never dims.
      ctx.disable(ctx.BLEND)
      ctx.enable(ctx.DEPTH_TEST)
      ctx.depthMask(true)
      ctx.uniform1i(uMode, 1)
      ctx.drawArrays(ctx.POINTS, 0, count)
      if (diffusion > 0) {
        ctx.enable(ctx.BLEND)
        ctx.blendFunc(ctx.ONE, ctx.ONE)
        ctx.depthMask(false)
        ctx.uniform1i(uMode, 2)
        ctx.drawArrays(ctx.POINTS, 0, count)
        ctx.depthMask(true)
      }
    } else {
      // 2D/1D is a single non-overlapping layer with no depth: one additive,
      // order-independent pass draws core + glow tail together.
      ctx.disable(ctx.DEPTH_TEST)
      ctx.enable(ctx.BLEND)
      ctx.blendFunc(ctx.ONE, ctx.ONE)
      ctx.uniform1i(uMode, 0)
      ctx.drawArrays(ctx.POINTS, 0, count)
    }
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
    opts: { canvasPx?: number } = {},
  ): void {
    pos3D = p
    if (p) {
      // Anchor the orb diameter to the layout's true neighbour gap, measured from
      // the points themselves — no cube-root lattice assumption (#63).
      lattice3DSpacing = nearestNeighborSpacing(p)
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

  function setDiffusion(d: number): void {
    diffusion = d < 0 ? 0 : d > 1 ? 1 : d
    // 2D resolves the glow once here (pitch is the static grid spacing); 3D
    // recomputes it per paint from the live projected pitch, so this only needs
    // to refresh the 2D quad sizes.
    if (!pos3D) apply2DGlow()
  }

  return { paint, updateGrid, setShapePositions, set3DPositions, setCamera, setDiffusion }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export type { Locked2DGrid }
