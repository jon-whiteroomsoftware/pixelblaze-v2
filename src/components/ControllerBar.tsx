import { useEffect, useRef, useState } from 'react'
import { useControllerStore } from '@/store/controllerStore'
import { describeControllerPill, type ControllerPhase } from '@/engine/controllerPillView'
import type { ControllerStatusTone } from '@/engine/controllerStatusView'

// The consolidated top-right Controller surface (#210). Supersedes the always-on
// header IP input (ControllerConnect) and the standalone status dot
// (ConnectionStatus): one row of interactive pills (one per connected Controller)
// plus a single adaptive entry affordance whose dropdown adapts to extension
// presence. The status indicator now lives *inside* each pill — there is no
// standalone dot. Thin shell over the keyed store + the pure pill view; the
// per-Controller panel relocation into the pill popover is Slice 2 (#211).

const TONE_DOT: Record<ControllerStatusTone, string> = {
  absent: 'bg-zinc-700',
  idle: 'bg-zinc-400',
  pending: 'bg-amber-400 animate-pulse',
  live: 'bg-live',
  error: 'bg-red-400',
}

/** The small Controller/chip glyph carried on every pill. */
function ChipGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function ControllerPillButton({
  ip,
  nickname,
  phase,
  active,
  onActivate,
  onRemove,
}: {
  ip: string
  nickname?: string
  phase: ControllerPhase
  active: boolean
  onActivate: () => void
  onRemove: () => void
}) {
  const { label, tooltip, tone, showDot } = describeControllerPill({ ip, nickname, phase })
  return (
    <span
      data-testid="controller-pill"
      data-active={active}
      data-phase={phase}
      title={tooltip}
      className={`group inline-flex items-center gap-1.5 h-6 rounded border pl-2 pr-1.5 font-mono text-xs transition-colors cursor-pointer select-none ${
        active
          ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
      }`}
    >
      <button type="button" onClick={onActivate} aria-label={`Activate ${label}`} aria-pressed={active} className="inline-flex items-center gap-1.5 focus:outline-none">
        <span className="text-zinc-400 group-hover:text-zinc-300">
          <ChipGlyph />
        </span>
        <span className="max-w-[10rem] truncate">{label}</span>
        {showDot && tone && <span data-testid="controller-pill-dot" className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Disconnect ${label}`}
        data-testid="controller-pill-remove"
        className="shrink-0 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-200 focus:opacity-100 focus:outline-none leading-none px-0.5"
      >
        ×
      </button>
    </span>
  )
}

export function ControllerBar() {
  const extensionPresent = useControllerStore((s) => s.extensionPresent)
  const controllers = useControllerStore((s) => s.controllers)
  const activeIp = useControllerStore((s) => s.activeIp)
  const detectExtension = useControllerStore((s) => s.detectExtension)
  const addController = useControllerStore((s) => s.addController)
  const removeController = useControllerStore((s) => s.removeController)
  const setActive = useControllerStore((s) => s.setActive)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const ips = Object.keys(controllers)
  const hasPills = ips.length > 0

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const openDropdown = () => {
    // Re-probe presence each time the affordance opens, so installing the
    // extension mid-session flips the dropdown from pitch to IP form.
    void detectExtension()
    setOpen(true)
  }

  const submitIp = () => {
    const ip = draft.trim()
    if (!ip) return
    setDraft('')
    setOpen(false)
    void addController(ip)
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2" data-testid="controller-bar">
      {ips.map((ip) => (
        <ControllerPillButton
          key={ip}
          ip={ip}
          nickname={controllers[ip].nickname}
          phase={controllers[ip].phase}
          active={ip === activeIp}
          onActivate={() => setActive(ip)}
          onRemove={() => void removeController(ip)}
        />
      ))}

      <button
        type="button"
        data-testid="controller-entry-button"
        aria-label={hasPills ? 'Add a Controller' : extensionPresent ? 'Connect a Controller' : 'Install the Controller extension'}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={`inline-flex items-center justify-center h-6 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus:outline-none ${
          hasPills ? 'w-6 text-base leading-none' : 'gap-1.5 px-2.5 text-xs font-mono'
        }`}
      >
        {hasPills ? '+' : extensionPresent ? 'Connect Controller' : 'Install extension'}
      </button>

      {open && (
        <div
          data-testid="controller-entry-dropdown"
          className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl font-mono text-xs text-zinc-300"
        >
          {extensionPresent ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitIp()
              }}
              className="flex flex-col gap-2"
            >
              <label className="text-zinc-400">Connect a Controller by IP</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Controller IP address"
                  placeholder="Controller IP"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                  data-testid="controller-ip-input"
                  className="h-7 flex-1 rounded border border-zinc-500 bg-zinc-950 px-2 text-zinc-200 placeholder:text-zinc-600 hover:border-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="controller-go"
                  disabled={!draft.trim()}
                  className="h-7 rounded border border-zinc-600 bg-zinc-800 px-3 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                >
                  Go
                </button>
              </div>
            </form>
          ) : (
            <div data-testid="controller-install-pitch" className="flex flex-col gap-2 leading-relaxed">
              <p className="text-zinc-200 font-semibold">Install the Pixelblaze extension</p>
              <p className="text-zinc-400">
                Connecting to a Controller on your LAN needs the companion browser extension. Sideload it,
                then follow the setup steps to grant it access to your Pixelblaze.
              </p>
              <button
                type="button"
                onClick={() => void detectExtension()}
                className="self-start rounded border border-zinc-600 bg-zinc-800 px-3 py-1 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100"
              >
                I've installed it
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
