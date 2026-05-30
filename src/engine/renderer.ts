export interface RendererGridConfig {
  rows: number
  cols: number
  spacing: number
  diffusion?: number
}

// Hard ceiling on grid dimensions. A runaway value (e.g. a stale persisted
// blob) would size the canvas and pixel loop to something that freezes the
// tab, so every layer that accepts a dimension clamps to this. Engine is the
// leaf module, so the constant lives here and the store/UI import it.
export const MAX_GRID_DIM = 256

export function clampGridDim(n: number): number {
  return Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(n) || 1))
}

function clampGrid<T extends RendererGridConfig>(grid: T): T {
  return { ...grid, rows: clampGridDim(grid.rows), cols: clampGridDim(grid.cols) }
}

export interface Renderer {
  paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void
  updateGrid(grid: RendererGridConfig): void
}

const DIM_FACTOR = 0.15

export function createRenderer(canvas: HTMLCanvasElement, initialGrid: RendererGridConfig): Renderer {
  let grid = clampGrid(initialGrid)
  const ctx = canvas.getContext('2d')

  function applySize(): void {
    canvas.width = Math.round(grid.cols * grid.spacing)
    canvas.height = Math.round(grid.rows * grid.spacing)
  }

  applySize()

  // jsdom and some test environments don't support Canvas 2D
  if (!ctx) {
    return {
      paint: () => undefined,
      updateGrid(newGrid) { grid = clampGrid(newGrid); applySize() },
    }
  }

  const ctx2d: CanvasRenderingContext2D = ctx

  function paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void {
    const { rows, cols, spacing } = grid
    // Constant radius — dots just touch their neighbours. Diffusion blur is
    // handled by a CSS filter in the UI layer (blur conserves total luminance,
    // so brightness stays constant across all diffusion settings).
    const radius = Math.max(0.5, spacing / 2)
    const dimScale = dimmed ? DIM_FACTOR : 1

    ctx2d.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < pixels.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (row >= rows) break

      const cx = col * spacing + spacing / 2
      const cy = row * spacing + spacing / 2

      const [r, g, b] = pixels[i]
      const scale = brightness * dimScale
      const rr = Math.round(clamp01(r * scale) * 255)
      const gg = Math.round(clamp01(g * scale) * 255)
      const bb = Math.round(clamp01(b * scale) * 255)
      const color = `rgb(${rr},${gg},${bb})`

      ctx2d.fillStyle = color
      ctx2d.beginPath()
      ctx2d.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx2d.fill()
    }

  }

  function updateGrid(newGrid: RendererGridConfig): void {
    grid = clampGrid(newGrid)
    applySize()
  }

  return { paint, updateGrid }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
