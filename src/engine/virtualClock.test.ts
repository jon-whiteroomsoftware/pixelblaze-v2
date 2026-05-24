import { createVirtualClock } from './virtualClock'

describe('virtualClock', () => {
  it('starts at 0', () => {
    const clock = createVirtualClock()
    expect(clock.getTime()).toBe(0)
  })

  it('accumulates time after a single advance', () => {
    const clock = createVirtualClock()
    clock.advance(100)
    expect(clock.getTime()).toBe(100)
  })

  it('sums multiple advances', () => {
    const clock = createVirtualClock()
    clock.advance(100)
    clock.advance(50)
    clock.advance(25)
    expect(clock.getTime()).toBe(175)
  })

  it('reset returns time to 0', () => {
    const clock = createVirtualClock()
    clock.advance(500)
    clock.reset()
    expect(clock.getTime()).toBe(0)
  })

  it('continues accumulating after reset', () => {
    const clock = createVirtualClock()
    clock.advance(200)
    clock.reset()
    clock.advance(30)
    expect(clock.getTime()).toBe(30)
  })
})
