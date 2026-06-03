// H2 (#194): the transport-provider seam. These tests pin the *shape* of the
// firewall — the interface any backend must satisfy — and the behaviour of the
// NullControllerProvider default. Concrete backends (H3 extension) get their own
// tests; here we prove the seam itself is sound and the no-helper default is safe
// to render against.

import { describe, it, expect, vi } from 'vitest'
import {
  NullControllerProvider,
  NO_CAPABILITIES,
  type ControllerProvider,
  type ControllerStatus,
} from './ControllerProvider'

describe('NO_CAPABILITIES', () => {
  it('reports neither push nor compile', () => {
    expect(NO_CAPABILITIES).toEqual({ push: false, compile: false })
  })
})

describe('NullControllerProvider', () => {
  it('satisfies the ControllerProvider interface', () => {
    // Compile-time assurance that the default conforms to the seam.
    const provider: ControllerProvider = new NullControllerProvider()
    expect(provider.capabilities).toBe(NO_CAPABILITIES)
  })

  it('detects no helper', async () => {
    await expect(new NullControllerProvider().detectHelper()).resolves.toBe(false)
  })

  it('reports the no-helper status', () => {
    const status: ControllerStatus = new NullControllerProvider().getStatus()
    expect(status).toEqual({ kind: 'no-extension' })
  })

  it('supports subscribe/unsubscribe without leaking', () => {
    const provider = new NullControllerProvider()
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)
    expect(typeof unsubscribe).toBe('function')
    // Null provider never changes status, so the listener is never called — but
    // unsubscribing must be safe and idempotent.
    expect(() => {
      unsubscribe()
      unsubscribe()
    }).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects connect() because no helper exists', async () => {
    await expect(new NullControllerProvider().connect({ address: '192.168.8.224' })).rejects.toThrow(
      /helper/i,
    )
  })

  it('resolves disconnect() as a safe no-op', async () => {
    await expect(new NullControllerProvider().disconnect()).resolves.toBeUndefined()
  })

  it('rejects every read/control operation when not connected', async () => {
    const p = new NullControllerProvider()
    await expect(p.getConfig()).rejects.toThrow(/not connected/i)
    await expect(p.getTelemetry()).rejects.toThrow(/not connected/i)
    await expect(p.listPrograms()).rejects.toThrow(/not connected/i)
    await expect(p.getVars()).rejects.toThrow(/not connected/i)
    await expect(p.getPixelMap()).rejects.toThrow(/not connected/i)
    await expect(p.setControls({ sliderX: 0.5 })).rejects.toThrow(/not connected/i)
    await expect(p.setBrightness(0.66)).rejects.toThrow(/not connected/i)
  })
})
