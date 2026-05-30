import { readFileSync } from 'fs'
import { join } from 'path'
import { bundle } from './bundle'
import { loadPattern } from './loadPattern'
import { createShim, createFxShim, planeShimConfig, type ShimContext } from './shim'
import { LIBRARIES } from '../pixelblaze/libs'

const src = readFileSync(
  join(__dirname, '../pixelblaze/demos/Kishimisu.js'),
  'utf8',
)

function timeFrame(useFidelity: boolean, rows: number, cols: number): number {
  const grid = { rows, cols }
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)
  const shim: ShimContext = useFidelity
    ? createFxShim({ ...planeShimConfig(grid), getVirtualTime: () => 0 })
    : createShim({ ...planeShimConfig(grid), getVirtualTime: () => 0 })
  const handle = loadPattern(useFidelity ? fxCode : code, metadata, shim.builtins)

  const renderOnce = () => {
    handle.beforeRender(shim.encodeScalar(16))
    for (let row = 0; row < rows; row++) {
      const y = rows === 1 ? 0 : row / (rows - 1)
      for (let col = 0; col < cols; col++) {
        const x = cols === 1 ? 0 : col / (cols - 1)
        const [tx, ty] = shim.transformPoint(x, y, 0)
        handle.render2D(shim.encodeScalar(row * cols + col), tx, ty)
        shim.capturedPixel()
      }
    }
  }
  renderOnce() // warm
  const t0 = performance.now()
  const N = 5
  for (let i = 0; i < N; i++) renderOnce()
  return (performance.now() - t0) / N
}

describe('PERF PROBE', () => {
  it('times Kishimisu at 64x32', () => {
    const fast = timeFrame(false, 64, 32)
    const fidelity = timeFrame(true, 64, 32)
    process.stderr.write(`\n[PERF] fast=${fast.toFixed(2)}ms  fidelity=${fidelity.toFixed(2)}ms  ratio=${(fidelity / fast).toFixed(1)}x\n`)
  })
})
