import {
  canvasSize,
  clampGridDim,
  clampPixelCount,
  MAX_PIXEL_COUNT,
  pointSize,
  projectIndex,
  projectPos,
  type Locked2DGrid,
} from './camera'

export interface RendererGridConfig {
  rows: number
  cols: number
  spacing: number
  diffusion?: number
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
}

const DIM_FACTOR = 0.15

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec3 a_color;
uniform float u_pointSize;
varying vec3 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = u_pointSize;
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
    }
  }

  const program = createProgram(gl)
  const posBuffer = gl.createBuffer()!
  const colorBuffer = gl.createBuffer()!
  const aPos = gl.getAttribLocation(program, 'a_pos')
  const aColor = gl.getAttribLocation(program, 'a_color')
  const uPointSize = gl.getUniformLocation(program, 'u_pointSize')

  // Locked-2D positions depend only on the grid, not the frame, so they're
  // rebuilt on grid change rather than per paint. `positions` is the clip-space
  // (x,y) per drawable index; `drawCount` is how many of those we actually draw.
  let positions = new Float32Array(0)
  let drawCount = 0
  // When set, draw positions come from a viewport shape embedding (1D path)
  // rather than the locked-2D grid. Null keeps the legacy grid path.
  let shapePos: [number, number][] | null = null

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
  }

  rebuildPositions()

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.clearColor(0, 0, 0, 1)

  const colors = () => new Float32Array(drawCount * 3)
  let colorData = colors()

  function paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void {
    const count = Math.min(drawCount, pixels.length, clampPixelCount(pixels.length))
    if (colorData.length !== drawCount * 3) colorData = colors()

    const dimScale = dimmed ? DIM_FACTOR : 1
    const scale = brightness * dimScale
    for (let i = 0; i < count; i++) {
      const [r, g, b] = pixels[i]
      colorData[i * 3] = clamp01(r * scale)
      colorData[i * 3 + 1] = clamp01(g * scale)
      colorData[i * 3 + 2] = clamp01(b * scale)
    }

    const ctx = gl as WebGLRenderingContext
    ctx.viewport(0, 0, canvas.width, canvas.height)
    ctx.clear(ctx.COLOR_BUFFER_BIT)
    ctx.useProgram(program)
    ctx.uniform1f(uPointSize, pointSize(grid))

    ctx.bindBuffer(ctx.ARRAY_BUFFER, posBuffer)
    ctx.enableVertexAttribArray(aPos)
    ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0)

    ctx.bindBuffer(ctx.ARRAY_BUFFER, colorBuffer)
    ctx.bufferData(ctx.ARRAY_BUFFER, colorData, ctx.DYNAMIC_DRAW)
    ctx.enableVertexAttribArray(aColor)
    ctx.vertexAttribPointer(aColor, 3, ctx.FLOAT, false, 0, 0)

    ctx.drawArrays(ctx.POINTS, 0, count)
  }

  function updateGrid(newGrid: RendererGridConfig): void {
    grid = clampGrid(newGrid)
    applySize()
    rebuildPositions()
    colorData = colors()
  }

  function setShapePositions(p: [number, number][] | null): void {
    shapePos = p
    rebuildPositions()
    colorData = colors()
  }

  return { paint, updateGrid, setShapePositions }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export type { Locked2DGrid }
