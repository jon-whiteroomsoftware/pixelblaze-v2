import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  // Accessible name for the trigger, e.g. "About these controls".
  label: string
  // Rich content shown in the popover.
  children: ReactNode
  // Popover width in px (clamped to the viewport).
  width?: number
}

// A small "?" affordance that reveals a richly formatted popover on hover, focus,
// or click — terse inline help, no native dialogs. Reusable across panes (#189,
// #191): callers pass the card content as children. Keyboard accessible (focus to
// open, Escape to close) and pointer-friendly (a short close delay lets the cursor
// travel from the trigger into the card).
export function HelpHint({ label, children, width = 320 }: Props) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardId = useId()

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (showTimer.current) clearTimeout(showTimer.current)
  }, [])

  const clearHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }
  const clearShow = () => {
    if (showTimer.current) clearTimeout(showTimer.current)
  }
  const show = () => {
    clearHide()
    clearShow()
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(true)
  }
  // Hover-intent: only open if the cursor rests on the trigger briefly, so a
  // mouse sweeping across the busy preview deck doesn't pop the card open.
  // Focus/click call show() directly and stay instant.
  const showAfterHoverIntent = () => {
    clearHide()
    clearShow()
    showTimer.current = setTimeout(show, 400)
  }
  const close = () => {
    clearHide()
    clearShow()
    setOpen(false)
  }
  // Delayed close for pointer/blur, so the cursor can travel from the trigger
  // into the card (whose onMouseEnter cancels it) without it flickering shut.
  const scheduleHide = () => {
    clearHide()
    clearShow()
    hideTimer.current = setTimeout(() => setOpen(false), 80)
  }

  // Position below the trigger, left-aligned, clamped into the viewport; flip
  // above if it would overflow the bottom edge.
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) : 0
  const below = rect ? rect.bottom + 6 : 0
  const flipUp = rect ? rect.bottom + 6 + 240 > window.innerHeight : false

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? cardId : undefined}
        onMouseEnter={showAfterHoverIntent}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
        className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border border-zinc-600 text-[11px] font-semibold leading-none text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 focus:outline-none focus:border-zinc-300 focus:text-zinc-100 cursor-help"
      >
        ?
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            id={cardId}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={{
              position: 'fixed',
              left,
              ...(flipUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: below }),
              width,
              zIndex: 50,
            }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3 font-mono text-xs"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
