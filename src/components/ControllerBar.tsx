import { useEffect, useRef, useState } from 'react'
import { useControllerStore } from '@/store/controllerStore'
import { describeControllerPill, type ControllerPhase } from '@/engine/controllerPillView'
import type { ControllerStatusTone } from '@/engine/controllerStatusView'
import { StatusDot, type StatusTone } from './StatusDot'
import { ControllerPanel } from './ControllerPanel'

// The consolidated top-right Controller surface (#210). Supersedes the always-on
// header IP input (ControllerConnect) and the standalone status dot
// (ConnectionStatus): one row of interactive pills (one per connected Controller)
// plus a single adaptive entry affordance whose dropdown adapts to extension
// presence. The status indicator now lives *inside* each pill — there is no
// standalone dot. Thin shell over the keyed store + the pure pill view.
//
// Clicking a pill activates that Controller and opens its live panel as a pinned
// popover anchored under the pill (#211): pinned so the brightness slider and live
// controls survive being dragged. Disconnect lives in the popover header beside
// the nickname/IP — there is no longer an inline remove affordance on the pill.

// Bridge the pill's status tone vocabulary to the shared StatusDot tones, so a
// connected Controller reads with the same amber `live` accent as a "good"
// compile, and "connecting" reads as the distinct working-grey pulse (not a
// second amber that's indistinguishable from connected).
const PILL_TONE: Record<ControllerStatusTone, StatusTone> = {
  absent: 'absent',
  idle: 'idle',
  pending: 'working',
  live: 'ok',
  error: 'error',
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
  panelOpen,
  onActivate,
  onRemove,
}: {
  ip: string
  nickname?: string
  phase: ControllerPhase
  active: boolean
  panelOpen: boolean
  onActivate: () => void
  onRemove: () => void
}) {
  const { label, tone, showDot } = describeControllerPill({ ip, nickname, phase })
  return (
    <span className="relative inline-flex">
      {/* The whole pill is one toggle target — clicking anywhere on it (chip,
          label, or status dot) opens/closes that Controller's panel. The IP is
          shown in the open panel's header, so the pill carries no hover tooltip. */}
      <button
        type="button"
        onClick={onActivate}
        aria-label={`Toggle ${label} panel`}
        aria-pressed={active}
        aria-expanded={panelOpen}
        data-testid="controller-pill"
        data-active={active}
        data-phase={phase}
        className={`group inline-flex items-center gap-1.5 h-6 rounded border px-2 font-mono text-xs transition-colors select-none focus:outline-none ${
          active
            ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <span className="text-zinc-400 group-hover:text-zinc-300">
          <ChipGlyph />
        </span>
        <span className="max-w-[10rem] truncate">{label}</span>
        {showDot && tone && <StatusDot tone={PILL_TONE[tone]} testId="controller-pill-dot" />}
      </button>

      {panelOpen && (
        <div
          data-testid="controller-panel-popover"
          className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl font-mono text-xs text-zinc-300"
        >
          <div className="flex items-center justify-between gap-2 border-b border-seam px-3 py-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-zinc-200">{nickname ?? ip}</span>
              {nickname && <span className="shrink-0 text-zinc-500">{ip}</span>}
            </span>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Disconnect ${label}`}
              data-testid="controller-pill-remove"
              className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 focus:outline-none"
            >
              Disconnect
            </button>
          </div>
          <div className="py-2 pr-3">
            <ControllerPanel />
          </div>
        </div>
      )}
    </span>
  )
}

export function ControllerBar() {
  const extensionPresent = useControllerStore((s) => s.extensionPresent)
  const controllers = useControllerStore((s) => s.controllers)
  const activeIp = useControllerStore((s) => s.activeIp)
  const detectExtension = useControllerStore((s) => s.detectExtension)
  const discover = useControllerStore((s) => s.discover)
  const discovered = useControllerStore((s) => s.discovered)
  const discovering = useControllerStore((s) => s.discovering)
  const addController = useControllerStore((s) => s.addController)
  const removeController = useControllerStore((s) => s.removeController)
  const setActive = useControllerStore((s) => s.setActive)

  const [open, setOpen] = useState(false)
  const [panelOpenIp, setPanelOpenIp] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const ips = Object.keys(controllers)
  const hasPills = ips.length > 0

  // Close the entry dropdown and any pinned panel popover on an outside click —
  // "pinned" means they survive interaction within the bar but dismiss on click-away.
  useEffect(() => {
    if (!open && panelOpenIp === null) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPanelOpenIp(null)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, panelOpenIp])

  // Clicking a pill activates that Controller and toggles its panel popover; the
  // panel is bound to the active Controller, so opening one closes any other.
  const onPillClick = (ip: string) => {
    setActive(ip)
    setOpen(false)
    setPanelOpenIp((prev) => (prev === ip ? null : ip))
  }

  const onPillRemove = (ip: string) => {
    setPanelOpenIp((prev) => (prev === ip ? null : prev))
    void removeController(ip)
  }

  const openDropdown = () => {
    // Re-probe presence each time the affordance opens, so installing the
    // extension mid-session flips the dropdown from pitch to IP form.
    void detectExtension()
    setPanelOpenIp(null)
    setOpen(true)
  }

  const submitIp = () => {
    const ip = draft.trim()
    if (!ip) return
    setDraft('')
    setOpen(false)
    void addController(ip)
  }

  // Connect to a discovered candidate by its LAN address — same path as a manual
  // IP, so it slots straight into the existing keyed connect (#197 foundation).
  const onDiscoveredClick = (address: string) => {
    setOpen(false)
    void addController(address)
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
          panelOpen={ip === panelOpenIp}
          onActivate={() => onPillClick(ip)}
          onRemove={() => onPillRemove(ip)}
        />
      ))}

      <button
        type="button"
        data-testid="controller-entry-button"
        aria-label={hasPills ? 'Add a Controller' : 'Connect a Controller'}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={`inline-flex items-center justify-center h-6 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus:outline-none ${
          hasPills ? 'w-6 text-base leading-none' : 'px-2.5 text-xs font-mono'
        }`}
      >
        {/* "Connect to Controller" until a Controller is live, when it collapses
            to a bare +. The dropdown — install pitch vs IP form — adapts to
            extension presence; the entry label does not (#211). */}
        {hasPills ? '+' : 'Connect to Controller'}
      </button>

      {open && (
        <div
          data-testid="controller-entry-dropdown"
          className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl font-mono text-xs text-zinc-300"
        >
          {extensionPresent ? (
            <div className="flex flex-col gap-3">
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

              {/* Auto-discovery (#206), tracer-bullet surface: a button that runs the
                  cloud sweep and lists candidates; clicking one connects via the same
                  keyed path as a manual IP. The full multi-Controller select model is
                  deferred — this just proves the cloud → helper → seam → connect pipe. */}
              <div className="flex flex-col gap-2 border-t border-seam pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400">Or find them on your network</label>
                  <button
                    type="button"
                    onClick={() => void discover()}
                    disabled={discovering}
                    data-testid="controller-discover"
                    className="h-6 rounded border border-zinc-600 bg-zinc-800 px-2 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40"
                  >
                    {discovering ? 'Scanning…' : 'Discover'}
                  </button>
                </div>
                {discovered.length > 0 && (
                  <ul className="flex flex-col gap-1" data-testid="controller-discovered-list">
                    {discovered.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onDiscoveredClick(c.address)}
                          data-testid="controller-discovered-item"
                          className="flex w-full items-baseline justify-between gap-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-left hover:border-zinc-500 hover:text-zinc-100"
                        >
                          <span className="truncate text-zinc-200">{c.name ?? c.address}</span>
                          <span className="shrink-0 text-zinc-500">{c.address}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!discovering && discovered.length === 0 && (
                  <p className="text-zinc-600" data-testid="controller-discover-empty">
                    No Controllers found yet. They must have network discovery enabled.
                  </p>
                )}
              </div>
            </div>
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
