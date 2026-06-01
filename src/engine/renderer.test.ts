import { createRenderer } from './renderer'

// A unit-square layout (a 2×2 plane) → square canvas at the container width.
const SQUARE_POS: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]

// jsdom provides no WebGL context, so this exercises the no-op degrade path.
describe('renderer — no GL context', () => {
  it('returns a renderer that no-ops paint and still tracks canvas size from the layout bounds', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { containerWidth: 640, lightSize: 0.5 })

    renderer.set2DPositions(SQUARE_POS, { containerWidth: 640, lightSize: 0.5 })
    // A square (unit-box) layout sizes to a square canvas at the container width.
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(640)

    // paint must not throw without a GL context
    expect(() => renderer.paint([[1, 0, 0]], 1, false)).not.toThrow()

    renderer.resize2D({ containerWidth: 320, lightSize: 0.5 })
    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(320)
  })

  it('sizes a non-square layout to its bounds aspect', () => {
    const canvas = document.createElement('canvas')
    const renderer = createRenderer(canvas, { containerWidth: 640 })
    // A 2:1-wide layout (y range half of x range) → half-height canvas.
    renderer.set2DPositions([[0, 0], [1, 0], [0, 0.5], [1, 0.5]], { containerWidth: 640 })
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(320)
  })
})
