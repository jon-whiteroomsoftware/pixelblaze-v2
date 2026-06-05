import { describe, it, expect } from 'vitest'
import { applyControllerPixelCount } from './applyControllerPixelCount'
import { NullControllerProvider } from './ControllerProvider'

class StubProvider extends NullControllerProvider {
  installedMap: number[][] | null = null
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
  mapWrites: number[][][] = []
  getPixelMapCalls = 0

  setPixelCount(value: number, save = true): Promise<void> {
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  getPixelMap(): Promise<number[][] | null> {
    this.getPixelMapCalls++
    return Promise.resolve(this.installedMap)
  }
  setPixelMap(points: number[][]): Promise<void> {
    this.mapWrites.push(points)
    return Promise.resolve()
  }
}

const grid = (n: number): number[][] => Array.from({ length: n }, (_, i) => [i, 0])

// Each apply issues a live (save:false) write to clear the tail, then a persisted
// (save:true) write so the count survives a reboot.
const pcWrites = (v: number) => [
  { value: v, save: false },
  { value: v, save: true },
]

describe('applyControllerPixelCount', () => {
  it('reduction with an oversized map truncates and re-sends the slice', async () => {
    const p = new StubProvider()
    p.installedMap = grid(128)
    const result = await applyControllerPixelCount(p, 58, 128)
    expect(p.pixelCountWrites).toEqual(pcWrites(58))
    expect(p.mapWrites).toHaveLength(1)
    expect(p.mapWrites[0]).toEqual(grid(58))
    expect(result).toBe(58)
  })

  it('reduction with no installed map writes only the count', async () => {
    const p = new StubProvider()
    p.installedMap = null
    const result = await applyControllerPixelCount(p, 58, 128)
    expect(p.pixelCountWrites).toEqual(pcWrites(58))
    expect(p.mapWrites).toEqual([])
    expect(result).toBeNull()
  })

  it('reduction with a map already small enough leaves the map alone', async () => {
    const p = new StubProvider()
    p.installedMap = grid(40)
    const result = await applyControllerPixelCount(p, 58, 128)
    expect(p.mapWrites).toEqual([])
    expect(result).toBeNull()
  })

  it('raising the count never reads or writes the map', async () => {
    const p = new StubProvider()
    p.installedMap = grid(128)
    const result = await applyControllerPixelCount(p, 200, 128)
    expect(p.pixelCountWrites).toEqual(pcWrites(200))
    expect(p.getPixelMapCalls).toBe(0)
    expect(p.mapWrites).toEqual([])
    expect(result).toBeNull()
  })

  it('unknown previous count writes only the count (no truncation guess)', async () => {
    const p = new StubProvider()
    p.installedMap = grid(128)
    const result = await applyControllerPixelCount(p, 58, null)
    expect(p.pixelCountWrites).toEqual(pcWrites(58))
    expect(p.getPixelMapCalls).toBe(0)
    expect(p.mapWrites).toEqual([])
    expect(result).toBeNull()
  })

  it('tolerates a failing map read-back — count still written', async () => {
    const p = new StubProvider()
    p.getPixelMap = () => Promise.reject(new Error('no map endpoint'))
    const result = await applyControllerPixelCount(p, 58, 128)
    expect(p.pixelCountWrites).toEqual(pcWrites(58))
    expect(p.mapWrites).toEqual([])
    expect(result).toBeNull()
  })
})
