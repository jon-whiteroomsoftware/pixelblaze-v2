import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { PreflightWarning } from '@/engine/preflight'
import { HelpHint } from '@/components/HelpHint'

// The push-reconciliation popover (#63 UI cleanup). Both Send actions (pattern,
// #203; map, #204/#213) used a centered modal AlertDialog to surface preflight
// warnings before a push — the only modals in the app, and they read as foreign.
// This is the dropdown analogue, matching the "Connect to Controller" entry
// affordance in ControllerBar: a small panel pinned under the trigger that
// explains the choices and carries the action buttons inline.
//
// Pure presentation + dismissal: it anchors under `anchor`, shows a title, and
// renders the caller's body + footer as children (the pattern flow lists warnings;
// the map flow composes checkboxes — see SendMapToController). Click-away and Escape
// both call `onCancel` (the dialog's "close any way cancels the push" contract carries
// over verbatim). The store's `preflight` slice still drives `open`.

// Footer button styles, shared so both Send flows read identically and match the
// zinc/live vocabulary of the rest of the bar. `cancel` is the neutral bordered
// chip; `action` carries the amber `live` accent (the deliberate push); `muted` is
// the de-emphasized escape hatch (map "push only" on a blocking mismatch).
const baseButton = 'h-7 rounded border px-3 text-xs transition-colors focus:outline-none'
export const pushPopoverButton = {
  cancel: `${baseButton} border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100`,
  muted: `${baseButton} border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200`,
  action: `${baseButton} border-live bg-live/10 text-live hover:bg-live/20 disabled:opacity-30 disabled:hover:bg-live/10`,
} as const

// The warning rows shared by both Send flows: each preflight warning's headline, with
// its longer firmware/behaviour explanation tucked behind an info-hover so the popover
// body stays short. The map flow appends checkboxes below this; the pattern flow appends
// a plain Send-anyway footer.
export function PreflightWarningList({ warnings }: { warnings: PreflightWarning[] }) {
  return (
    <div className="mt-2 space-y-1.5 text-zinc-400">
      {warnings.map((w) => (
        <p key={w.kind} className="flex items-start gap-1">
          <span>{w.message}</span>
          {w.detail && (
            <HelpHint label="More about this warning" width={260}>
              <p className="leading-relaxed text-zinc-300">{w.detail}</p>
            </HelpHint>
          )}
        </p>
      ))}
    </div>
  )
}

export function PushConfirmPopover({
  open,
  onCancel,
  title,
  testId,
  anchor,
  children,
}: {
  open: boolean
  onCancel: () => void
  title: string
  testId: string
  /** The trigger button — rendered as the popover's anchor. */
  anchor: ReactNode
  /** Popover body + footer (warnings/checkboxes and the action buttons). */
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCancel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  return (
    <span ref={rootRef} className="relative inline-flex">
      {anchor}
      {open && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          data-testid={testId}
          className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl font-mono text-xs text-zinc-300"
        >
          <p id={titleId} className="font-semibold text-zinc-100">
            {title}
          </p>
          {children}
        </div>
      )}
    </span>
  )
}
