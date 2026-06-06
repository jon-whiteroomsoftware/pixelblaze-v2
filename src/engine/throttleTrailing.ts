/** A leading + trailing throttle: rate-limits a side-effecting call to at most one
 *  per `intervalMs`, while guaranteeing the *final* value is always delivered.
 *
 *  Built for the Controller brightness slider (#213 follow-up): dragging the slider
 *  fires `onChange` on every pixel of travel, each of which would otherwise blast a
 *  WebSocket frame at the device. We want live tracking (so not a pure debounce that
 *  waits for the drag to stop) but damped traffic — hence throttle:
 *
 *    - the first call in a quiet window fires immediately (leading edge), so the
 *      strip responds instantly to a scrub;
 *    - calls during the cooldown are coalesced — only the latest value survives —
 *      and flushed once when the window elapses (trailing edge), so we never settle
 *      on a stale value when the user stops mid-window.
 *
 *  `now` and `schedule` are injectable so tests drive it with a fake clock instead
 *  of real timers. Pure orchestration over the passed `fn` — zero framework imports.
 */
export function throttleTrailing<T>(
  fn: (value: T) => void,
  intervalMs: number,
  now: () => number = () => Date.now(),
  schedule: (cb: () => void, ms: number) => void = (cb, ms) => {
    setTimeout(cb, ms)
  },
): (value: T) => void {
  let lastRun = -Infinity
  let pending: { value: T } | null = null
  let scheduled = false

  function run(value: T) {
    lastRun = now()
    fn(value)
  }

  function flush() {
    scheduled = false
    if (pending) {
      const { value } = pending
      pending = null
      run(value)
    }
  }

  return (value: T) => {
    const elapsed = now() - lastRun
    if (elapsed >= intervalMs) {
      run(value)
      return
    }
    // In cooldown: keep only the latest value and ensure a trailing flush is queued.
    pending = { value }
    if (!scheduled) {
      scheduled = true
      schedule(flush, intervalMs - elapsed)
    }
  }
}
