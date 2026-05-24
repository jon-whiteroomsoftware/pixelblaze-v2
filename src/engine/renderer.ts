export interface RendererGridConfig {
  rows: number
  cols: number
  spacing: number
  glow: boolean
  glowAmount: number
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

  function paint(pixels: [number, number, number][], brightness: number, dimmed: boolean): void {
    const { rows, cols, spacing, glow, glowAmount } = grid
    const radius = spacing / 2 - 2
    const dimScale = dimmed ? DIM_FACTOR : 1

    ctx.clearRect(0, 0, canvas.width, canvas.height)

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

      if (glow) {
        ctx.shadowBlur = glowAmount
        ctx.shadowColor = color
      } else {
        ctx.shadowBlur = 0
      }

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // Reset shadow so it doesn't leak
    ctx.shadowBlur = 0
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
