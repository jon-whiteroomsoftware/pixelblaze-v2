import { describeControllerPill } from './controllerPillView'

describe('describeControllerPill', () => {
  it('labels a live, named Controller by its nickname', () => {
    const v = describeControllerPill({ ip: '10.0.0.5', nickname: 'Desk', phase: 'live' })
    expect(v.label).toBe('Desk')
    expect(v.tone).toBe('live')
    expect(v.tooltip).toBe('10.0.0.5')
  })

  it('falls back to the IP when live but nameless', () => {
    const v = describeControllerPill({ ip: '10.0.0.5', phase: 'live' })
    expect(v.label).toBe('10.0.0.5')
  })

  it('keeps a known name through a pending churn, conveying connecting via the dot', () => {
    // A seeded reconnect (or a transient live→pending churn) must not flash the IP:
    // the name is sticky, only the dot tone reverts to pending.
    const v = describeControllerPill({ ip: '10.0.0.5', nickname: 'Desk', phase: 'pending' })
    expect(v.label).toBe('Desk')
    expect(v.tone).toBe('pending')
  })

  it('labels a nameless pending pill by its IP and pulses', () => {
    const v = describeControllerPill({ ip: '10.0.0.5', phase: 'pending' })
    expect(v.label).toBe('10.0.0.5')
    expect(v.tone).toBe('pending')
  })

  it('marks an errored pill red', () => {
    const v = describeControllerPill({ ip: '10.0.0.5', phase: 'error' })
    expect(v.tone).toBe('error')
    expect(v.showDot).toBe(true)
  })

  it('always surfaces the IP as the tooltip', () => {
    expect(describeControllerPill({ ip: '10.0.0.5', phase: 'error' }).tooltip).toBe('10.0.0.5')
  })
})
