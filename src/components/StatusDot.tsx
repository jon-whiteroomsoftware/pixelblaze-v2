// The one small status dot shared by every "is this thing OK?" indicator in the
// chrome — the editor's compile badge and each Controller pill. Centralising the
// tone -> class mapping here keeps those readouts on the same visual vocabulary
// (they used to inline identical markup and could silently drift):
//
//   ok         — green: healthy / connected / compile-good (traffic-light "go")
//   working    — amber, pulsing: in-flight compile — traffic-light "wait", distinct
//                from the steady green of connected
//   connecting — amber, fast hard blink: a link establishing, like a modem's link LED
//                searching for signal. Settles to the solid green `ok` once connected.
//   error      — red
//   idle       — quiet grey, present but inactive
//   absent     — near-invisible grey, nothing there
//
// Pure presentational shell over a class map; no store reads, no logic.

export type StatusTone = 'ok' | 'working' | 'connecting' | 'error' | 'idle' | 'absent'

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-ok',
  working: 'bg-amber-400 animate-pulse',
  connecting: 'bg-amber-400 animate-blink-connect',
  error: 'bg-red-400',
  idle: 'bg-zinc-400',
  absent: 'bg-zinc-700',
}

export function StatusDot({
  tone,
  testId,
  ...rest
}: {
  tone: StatusTone
  testId?: string
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-testid={testId}
      className={`w-2 h-2 rounded-full shrink-0 ${TONE_CLASS[tone]}`}
      {...rest}
    />
  )
}
