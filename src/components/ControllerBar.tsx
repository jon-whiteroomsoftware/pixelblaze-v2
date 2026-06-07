import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useControllerStore } from '@/store/controllerStore'
import { describeControllerPill, type ControllerPhase } from '@/engine/controllerPillView'
import type { ControllerStatusTone } from '@/engine/controllerStatusView'
import { StatusDot, type StatusTone } from './StatusDot'
import { ControllerPanel } from './ControllerPanel'
import { ControllerPanelTitle } from './ControllerPanelTitle'

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

// Bridge the pill's status tone vocabulary to the shared StatusDot tones. A live
// Controller reads as solid green `ok`; a connecting one blinks amber hard (like a
// modem's link LED searching for signal) and then settles to the solid green dot
// once the link is up.
const PILL_TONE: Record<ControllerStatusTone, StatusTone> = {
  absent: 'absent',
  idle: 'idle',
  pending: 'connecting',
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

/** A two-prong plug + cord — the familiar "plug it in" connect affordance. */
function ConnectGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      {/* Two prongs poking up out of the plug body. */}
      <path d="M6.25 1.5v4M9.75 1.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Plug body: flat top with a rounded bowl underneath. */}
      <path d="M4 5.5h8v0.5a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Cord dropping straight down from the body. */}
      <path d="M8 10v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
            {/* Title mirrors the editor and preview panes: the running pattern
                name + dimensionality, not the device name (which already labels the
                pill this popover hangs from). */}
            <ControllerPanelTitle />
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

// While the connection dropdown is open, re-sweep the network on this cadence so
// a Controller that powers up (or drops) shows up without a manual rescan. Cloud
// discovery, so this costs no Pixelblaze socket slots.
const DISCOVERY_REFRESH_MS = 10_000

// A manual rescan is usually so fast (cloud-cached, often a no-op) that the real
// `discovering` flag barely flickers — the click looks like it did nothing. Hold
// the spinner on for at least this long so the click always reads as "working".
// Must equal this spinner's rotation period (RESCAN_SPIN_CLASS below) so the icon
// completes exactly one full turn and lands back at its start angle instead of
// popping mid-spin. Kept snappy (vs the 1s push spinner) so the click feels quick.
const MIN_RESCAN_SPIN_MS = 600

// Spin scoped to the rescan icon only — the Send-to-Controller push spinner keeps
// Tailwind's default `animate-spin` (1s). We deliberately do NOT layer
// `[animation-duration]` on top of `animate-spin`: the shorthand `animation` and the
// longhand `animation-duration` then fight, and which wins depends on CSS source
// order. Instead this is a single self-contained `animation` shorthand (referencing
// the `spin` keyframes Tailwind already emits) — one declaration, order-independent,
// no !important. One full rotation in MIN_RESCAN_SPIN_MS so it lands back at start.
const RESCAN_SPIN_CLASS = '[animation:spin_0.6s_linear_infinite] text-amber-400'

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
  // Forces the rescan spinner to stay visible for MIN_RESCAN_SPIN_MS after a
  // manual click, independent of how fast the actual sweep resolves.
  const [manualSpin, setManualSpin] = useState(false)
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

  // Auto-run discovery the moment the dropdown opens (once the extension is
  // confirmed present), then keep the list fresh on a slow tick while it stays
  // open. Removes the need to click a "Discover" button at all; the manual
  // refresh affordance below is just for impatient rescans. The store's
  // re-entrancy guard keeps the immediate sweep and the tick from overlapping.
  // We pull `discover` off the store via getState() rather than closing over the
  // selector value so this effect's deps are exactly the gate (open + presence) —
  // it sets up/tears down the interval once per open, never per render.
  useEffect(() => {
    if (!open || !extensionPresent) return
    const sweep = () => void useControllerStore.getState().discover()
    sweep()
    const id = window.setInterval(sweep, DISCOVERY_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [open, extensionPresent])

  // Release the forced spin window after a manual rescan.
  useEffect(() => {
    if (!manualSpin) return
    const t = window.setTimeout(() => setManualSpin(false), MIN_RESCAN_SPIN_MS)
    return () => window.clearTimeout(t)
  }, [manualSpin])

  // Manual rescan: kick a sweep and force a visible spin even if it returns instantly.
  const onRescan = () => {
    setManualSpin(true)
    void discover()
  }
  // Spin when a real sweep is in flight OR through the forced post-click window.
  const rescanSpinning = discovering || manualSpin

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
  // Seed the discovered name so the pending pill is born named rather than flashing
  // the bare IP until the device's getConfig lands (#230).
  const onDiscoveredClick = (address: string, name?: string) => {
    setOpen(false)
    void addController(address, name)
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
          hasPills ? 'w-6 text-base leading-none' : 'gap-1.5 px-2 text-xs font-mono'
        }`}
      >
        {/* Plug glyph + "Connect" until a Controller is live, when it collapses
            to a bare +. This mirrors the connected pill's chip-glyph-plus-label
            shape so the two states read as one family. The dropdown — install
            pitch vs IP form — adapts to extension presence; the entry label does
            not (#211). */}
        {hasPills ? (
          '+'
        ) : (
          <>
            <ConnectGlyph />
            Connect
          </>
        )}
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

              {/* Auto-discovery (#206): the sweep runs automatically on open and on
                  a slow tick (see the effect above); clicking a candidate connects via
                  the same keyed path as a manual IP. The ↻ affordance is a manual
                  rescan for impatience — the user no longer has to kick it off. */}
              <div className="flex flex-col gap-2 border-t border-seam pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400">Controllers on your network</label>
                  {/* Same refresh icon + amber spin as the editor-header push button
                      (SendToController), just standalone here. Spins while a sweep is
                      in flight or through the forced min-spin after a manual click. */}
                  <button
                    type="button"
                    onClick={onRescan}
                    disabled={rescanSpinning}
                    aria-busy={rescanSpinning}
                    data-testid="controller-discover"
                    aria-label="Rescan network"
                    title="Rescan"
                    className={`flex h-7 w-7 items-center justify-center rounded border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 ${
                      rescanSpinning ? 'opacity-100' : 'disabled:opacity-40'
                    }`}
                  >
                    <RotateCw
                      size={16}
                      strokeWidth={2.75}
                      className={rescanSpinning ? RESCAN_SPIN_CLASS : ''}
                      aria-hidden
                    />
                  </button>
                </div>
                {discovered.length > 0 && (
                  <ul className="flex flex-col gap-1" data-testid="controller-discovered-list">
                    {discovered.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onDiscoveredClick(c.address, c.name)}
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
                {discovering && discovered.length === 0 && (
                  <p className="text-zinc-500" data-testid="controller-discover-scanning">
                    Scanning…
                  </p>
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
