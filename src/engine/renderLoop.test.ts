import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRenderLoop } from './renderLoop'
import type { PatternHandle } from './loadPattern'
import type { ShimContext } from './shim'

function makeMockHandle(): PatternHandle {
  return {
    beforeRender: vi.fn(),
    render2D: vi.fn(),
    getExports: vi.fn(() => ({})),
    controls: {},
  }
}

function makeMockShim(): ShimContext {
  return {
    builtins: {},
    capturedPixel: vi.fn(() => [0, 0, 0] as [number, number, number]),
  }
}

beforeEach(() => { vi.restoreAllMocks() })

// ── frame sequencing ──────────────────────────────────────────────────────────

describe('tick sequencing', () => {
  it('calls beforeRender once per tick', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 2, cols: 2 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(handle.beforeRender).toHaveBeenCalledOnce()
  })

  it('calls render2D once per pixel per tick', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 3, cols: 4 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(handle.render2D).toHaveBeenCalledTimes(12)
  })

  it('calls beforeRender before any render2D', () => {
    const callOrder: string[] = []
    const handle = makeMockHandle()
    ;(handle.beforeRender as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('br'))
    ;(handle.render2D as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('r2d'))
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 1, cols: 2 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(callOrder[0]).toBe('br')
  })
})

// ── coordinates ───────────────────────────────────────────────────────────────

describe('pixel coordinates', () => {
  it('first pixel receives index=0, x=0, y=0', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 3, cols: 3 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(handle.render2D).toHaveBeenNthCalledWith(1, 0, 0, 0)
  })

  it('last pixel in a 3x3 grid receives index=8, x=1, y=1', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 3, cols: 3 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(handle.render2D).toHaveBeenNthCalledWith(9, 8, 1, 1)
  })

  it('single-column grid uses x=0 for all pixels', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 3, cols: 1 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    // all three pixels: x should be 0
    const calls = (handle.render2D as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.map((c: unknown[]) => c[1])).toEqual([0, 0, 0])
  })

  it('single-row grid uses y=0 for all pixels', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 1, cols: 3 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    const calls = (handle.render2D as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.map((c: unknown[]) => c[2])).toEqual([0, 0, 0])
  })

  it('middle pixel in a 3-col row has x=0.5', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 1, cols: 3 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    const calls = (handle.render2D as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[1][1]).toBeCloseTo(0.5) // second pixel, x
  })
})

// ── pixel array ───────────────────────────────────────────────────────────────

describe('pixel array', () => {
  it('passes a pixel for every grid position to paint', () => {
    const paint = vi.fn()
    const loop = createRenderLoop({
      handle: makeMockHandle(), shim: makeMockShim(),
      grid: { rows: 4, cols: 5 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint,
    })
    loop.tick(16)
    const pixels = paint.mock.calls[0][0] as unknown[]
    expect(pixels).toHaveLength(20)
  })

  it('pixel array entries come from capturedPixel after each render2D', () => {
    const shim = makeMockShim()
    let call = 0
    ;(shim.capturedPixel as ReturnType<typeof vi.fn>).mockImplementation(
      () => [++call * 0.1, 0, 0] as [number, number, number],
    )
    const paint = vi.fn()
    const loop = createRenderLoop({
      handle: makeMockHandle(), shim,
      grid: { rows: 1, cols: 3 },
      getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
      paint,
    })
    loop.tick(16)
    const pixels = paint.mock.calls[0][0] as [number, number, number][]
    expect(pixels[0][0]).toBeCloseTo(0.1)
    expect(pixels[1][0]).toBeCloseTo(0.2)
    expect(pixels[2][0]).toBeCloseTo(0.3)
  })

  it('passes brightness and dimmed flag to paint', () => {
    const paint = vi.fn()
    const loop = createRenderLoop({
      handle: makeMockHandle(), shim: makeMockShim(),
      grid: { rows: 1, cols: 1 },
      getSpeed: () => 1, getBrightness: () => 0.6, isDimmed: () => true,
      paint,
    })
    loop.tick(16)
    expect(paint).toHaveBeenCalledWith(expect.anything(), 0.6, true)
  })
})

// ── delta scaling ─────────────────────────────────────────────────────────────

describe('delta scaling', () => {
  it('passes delta scaled by speed to beforeRender', () => {
    const handle = makeMockHandle()
    const loop = createRenderLoop({
      handle, shim: makeMockShim(),
      grid: { rows: 1, cols: 1 },
      getSpeed: () => 2, getBrightness: () => 1, isDimmed: () => false,
      paint: vi.fn(),
    })
    loop.tick(16)
    expect(handle.beforeRender).toHaveBeenCalledWith(32)
  })
})
