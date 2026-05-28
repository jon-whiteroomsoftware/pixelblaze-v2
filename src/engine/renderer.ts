export interface RendererGridConfig {
  rows: number
  cols: number
  spacing: number
  diffusion?: number
}

export interface Renderer {
  paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void
  updateGrid(grid: RendererGridConfig): void
}

const DIM_FACTOR = 0.15

export function createRenderer(canvas: HTMLCanvasElement, initialGrid: RendererGridConfig): Renderer {
  let grid = initialGrid
  const ctx = canvas.getContext('2d')

  function applySize(): void {
    canvas.width = grid.cols * grid.spacing
    canvas.height = grid.rows * grid.spacing
  }

  applySize()

  // jsdom and some test environments don't support Canvas 2D
  if (!ctx) {
    return {
      paint: () => undefined,
      updateGrid(newGrid) { grid = newGrid; applySize() },
    }
  }

  const ctx2d: CanvasRenderingContext2D = ctx

  function paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void {
    const { rows, cols, spacing } = grid
    // Grow the dot radius with diffusion so the lit area closes its gaps:
    // at diffusion 0 we draw distinct dots, at 1 the dots overlap and fully
    // cover the grid, leaving no black for the blur to average toward (which
    // is what otherwise causes brightness to fall off as diffusion rises).
    const diffusion = grid.diffusion ?? 0
    // Floor baseRadius so dense grids (small spacing) don't go negative —
    // arc() rejects negative radii. 0.5 keeps a 1px dot visible at any density.
    const baseRadius = Math.max(0.5, spacing / 2 - 3)
    const fullRadius = spacing * 0.62
    const radius = baseRadius + diffusion * (fullRadius - baseRadius)
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
    grid = newGrid
    applySize()
  }

  return { paint, updateGrid }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
