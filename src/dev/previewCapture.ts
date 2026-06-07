// Dev-only preview frame capture.
//
// Pairs with the `?capture` renderer flag (which enables preserveDrawingBuffer so
// the WebGL canvas stays readable) and the Vite `/__capture` dev endpoint (which
// writes posted PNG bytes to disk). The capture is taken *inside* the render
// loop's paint(), immediately after the draw, so the saved PNG is always exactly
// the frame that was just rendered — not whatever an out-of-band readback happens
// to catch, which can be a stale or cleared buffer.
//
// Entirely inert unless `?capture` is in the URL. Never used in production.

/** True when the app was loaded with `?capture` — gates all capture wiring. */
export function captureEnabled(): boolean {
  return (
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('capture')
  )
}

export interface PreviewCapture {
  /** Register a capture request; the next afterPaint() fulfils it. */
  request(name: string): Promise<unknown>
  /** Call from inside paint(), after the draw, to fulfil a pending request. */
  afterPaint(canvas: HTMLCanvasElement | null): void
}

export function createPreviewCapture(): PreviewCapture {
  let pending: { name: string; resolve: (r: unknown) => void } | null = null
  return {
    request(name) {
      return new Promise((resolve) => {
        // A new request before the previous one painted supersedes it; resolve
        // the old promise rather than orphaning it.
        if (pending) pending.resolve({ ok: false, error: 'superseded' })
        pending = { name, resolve }
      })
    },
    afterPaint(canvas) {
      const req = pending
      if (!req || !canvas) return
      pending = null
      canvas.toBlob((blob) => {
        if (!blob) {
          req.resolve({ ok: false, error: 'toBlob returned null' })
          return
        }
        fetch('/__capture?name=' + encodeURIComponent(req.name), {
          method: 'POST',
          body: blob,
        })
          .then((r) => r.json())
          .then(req.resolve)
          .catch((e) => req.resolve({ ok: false, error: String(e) }))
      }, 'image/png')
    },
  }
}
