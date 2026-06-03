import { describeControllerStatus } from './controllerStatusView'
import type { ControllerStatus } from './ControllerProvider'

describe('describeControllerStatus', () => {
  it('marks no-helper as absent', () => {
    const v = describeControllerStatus({ kind: 'no-extension' })
    expect(v.kind).toBe('no-extension')
    expect(v.tone).toBe('absent')
    expect(v.label).toMatch(/helper/i)
  })

  it('marks helper-present as idle (no Controller)', () => {
    const v = describeControllerStatus({ kind: 'extension-present' })
    expect(v.tone).toBe('idle')
    expect(v.label).toMatch(/no controller/i)
  })

  it('shows the target address while connecting', () => {
    const status: ControllerStatus = { kind: 'connecting', target: { address: '10.0.0.5' } }
    const v = describeControllerStatus(status)
    expect(v.tone).toBe('pending')
    expect(v.label).toContain('10.0.0.5')
  })

  it('prefers the Controller name when connected', () => {
    const status: ControllerStatus = {
      kind: 'connected',
      controller: { id: 'a', address: '10.0.0.5', name: 'Hallway' },
    }
    const v = describeControllerStatus(status)
    expect(v.tone).toBe('live')
    expect(v.label).toContain('Hallway')
  })

  it('falls back to the address when connected without a name', () => {
    const status: ControllerStatus = {
      kind: 'connected',
      controller: { id: 'a', address: '10.0.0.5' },
    }
    expect(describeControllerStatus(status).label).toContain('10.0.0.5')
  })

  it('surfaces the error message', () => {
    const v = describeControllerStatus({ kind: 'error', message: 'relay dropped' })
    expect(v.tone).toBe('error')
    expect(v.label).toBe('relay dropped')
  })
})
