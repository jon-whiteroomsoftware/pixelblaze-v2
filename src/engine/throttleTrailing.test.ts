import { throttleTrailing } from './throttleTrailing'

/** A controllable fake clock + scheduler so the throttle is tested deterministically
 *  without real timers. `tick` advances time and fires any due scheduled callbacks. */
function fakeClock() {
  let t = 0
  const queue: { at: number; cb: () => void }[] = []
  return {
    now: () => t,
    schedule: (cb: () => void, ms: number) => {
      queue.push({ at: t + ms, cb })
    },
    tick(ms: number) {
      t += ms
      const due = queue.filter((q) => q.at <= t)
      for (const q of due) queue.splice(queue.indexOf(q), 1)
      for (const q of due) q.cb()
    },
  }
}

describe('throttleTrailing', () => {
  it('fires the first call immediately (leading edge)', () => {
    const clock = fakeClock()
    const calls: number[] = []
    const t = throttleTrailing((v: number) => calls.push(v), 100, clock.now, clock.schedule)

    t(1)
    expect(calls).toEqual([1])
  })

  it('coalesces calls within the window to a single trailing flush of the latest value', () => {
    const clock = fakeClock()
    const calls: number[] = []
    const t = throttleTrailing((v: number) => calls.push(v), 100, clock.now, clock.schedule)

    t(1) // leading, fires now
    clock.tick(20)
    t(2) // in cooldown, queued
    clock.tick(20)
    t(3) // in cooldown, replaces queued value
    expect(calls).toEqual([1])

    clock.tick(100) // window elapses, trailing flush
    expect(calls).toEqual([1, 3])
  })

  it('always delivers the final value (never settles stale)', () => {
    const clock = fakeClock()
    const calls: number[] = []
    const t = throttleTrailing((v: number) => calls.push(v), 100, clock.now, clock.schedule)

    t(0.1)
    t(0.5)
    t(0.9) // final drag value, mid-window
    clock.tick(100)
    expect(calls[calls.length - 1]).toBe(0.9)
  })

  it('fires immediately again once a full quiet window has passed', () => {
    const clock = fakeClock()
    const calls: number[] = []
    const t = throttleTrailing((v: number) => calls.push(v), 100, clock.now, clock.schedule)

    t(1)
    clock.tick(150)
    t(2) // quiet window elapsed → leading edge again
    expect(calls).toEqual([1, 2])
  })
})
