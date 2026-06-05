import { describe, it, expect } from 'vitest'
import { applyControllerPixelCount } from './applyControllerPixelCount'
import { NullControllerProvider, type ControllerConfig } from './ControllerProvider'

class StubProvider extends NullControllerProvider {
  config: ControllerConfig = { brightness: 0.5 }
  configRejects = false
  calls: string[] = []
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
  brightnessWrites: Array<{ value: number; save: boolean }> = []

  getConfig(): Promise<ControllerConfig> {
    this.calls.push('getConfig')
    return this.configRejects
      ? Promise.reject(new Error('no config'))
      : Promise.resolve(this.config)
  }
  setPixelCount(value: number, save = true): Promise<void> {
    this.calls.push(`setPixelCount(${value},${save})`)
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.calls.push(`setBrightness(${value},${save})`)
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
}

// Pass an instant sleep so the dark-frame wait doesn't slow the suite.
const noSleep = () => Promise.resolve()

describe('applyControllerPixelCount', () => {
  it('reduction blacks out the strip, shrinks, then restores brightness (#222)', async () => {
    const p = new StubProvider()
    p.config = { brightness: 0.17 }
    await applyControllerPixelCount(p, 4, 256, noSleep)
    // Drive every (old-length) LED to black, *then* drop the count so the tail
    // freezes at black, then bring brightness back to where it was.
    expect(p.calls).toEqual([
      'getConfig',
      'setBrightness(0,false)',
      'setPixelCount(4,true)',
      'setBrightness(0.17,false)',
    ])
  })

  it('reduction with unreadable brightness falls back to a plain count write', async () => {
    // Without a known brightness we cannot safely zero it (we could strand the
    // strip dark), so skip the blackout entirely.
    const p = new StubProvider()
    p.configRejects = true
    await applyControllerPixelCount(p, 4, 256, noSleep)
    expect(p.brightnessWrites).toEqual([])
    expect(p.pixelCountWrites).toEqual([{ value: 4, save: true }])
  })

  it('reduction with no brightness in config falls back to a plain count write', async () => {
    const p = new StubProvider()
    p.config = {}
    await applyControllerPixelCount(p, 4, 256, noSleep)
    expect(p.brightnessWrites).toEqual([])
    expect(p.pixelCountWrites).toEqual([{ value: 4, save: true }])
  })

  it('raising the count just writes it — no blackout, no config read', async () => {
    const p = new StubProvider()
    await applyControllerPixelCount(p, 256, 4, noSleep)
    expect(p.calls).toEqual(['setPixelCount(256,true)'])
  })

  it('unchanged count just writes it', async () => {
    const p = new StubProvider()
    await applyControllerPixelCount(p, 64, 64, noSleep)
    expect(p.calls).toEqual(['setPixelCount(64,true)'])
  })

  it('unknown previous count just writes it (cannot tell a reduction)', async () => {
    const p = new StubProvider()
    await applyControllerPixelCount(p, 4, null, noSleep)
    expect(p.calls).toEqual(['setPixelCount(4,true)'])
  })
})
