import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPreviewCapture } from './previewCapture'

// A minimal canvas stub whose toBlob immediately yields a fixed blob.
function fakeCanvas(blob: Blob | null = new Blob(['x'], { type: 'image/png' })) {
  return {
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  } as unknown as HTMLCanvasElement
}

describe('createPreviewCapture', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ ok: true, path: '/tmp/x.png' }) })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('afterPaint is a no-op when no capture is pending', () => {
    const cap = createPreviewCapture()
    cap.afterPaint(fakeCanvas())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fulfils a pending request on the next afterPaint, POSTing to the named endpoint', async () => {
    const cap = createPreviewCapture()
    const result = cap.request('diff-50.png')
    cap.afterPaint(fakeCanvas())
    await expect(result).resolves.toEqual({ ok: true, path: '/tmp/x.png' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/__capture?name=diff-50.png')
  })

  it('only fulfils once — a second afterPaint with no new request does nothing', async () => {
    const cap = createPreviewCapture()
    const result = cap.request('a.png')
    cap.afterPaint(fakeCanvas())
    await result
    cap.afterPaint(fakeCanvas())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('supersedes an unpainted request rather than orphaning its promise', async () => {
    const cap = createPreviewCapture()
    const first = cap.request('first.png')
    const second = cap.request('second.png')
    cap.afterPaint(fakeCanvas())
    await expect(first).resolves.toMatchObject({ ok: false, error: 'superseded' })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('resolves with an error (not reject) when toBlob yields null', async () => {
    const cap = createPreviewCapture()
    const result = cap.request('a.png')
    cap.afterPaint(fakeCanvas(null))
    await expect(result).resolves.toMatchObject({ ok: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})
