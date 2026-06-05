import { type ReactNode } from 'react'
import { HelpHint } from '@/components/HelpHint'

// The shared dashboard-deck template (#198). These presentational primitives were
// extracted from the preview control deck so the preview deck and the live
// Controller panel render from one common layout vocabulary — section headers,
// the 2-col label/value grid, label/value cells, and read-only telemetry readouts.
// Making the template shared makes UI consistency *structural*: the two dashboards
// can't drift apart without changing this file. Pure presentation — every primitive
// is fed by props; what fills it (preview settings vs. live Controller state) is the
// caller's concern. No store reads, no engine imports.

// A help card for a deck section: a one-line framing of what the section *is*, then
// a label-keyed list of its controls. Brief, aimed at someone who already knows
// Pixelblaze — what each control does, not how it's implemented.
export function DeckSectionHint({
  intro,
  items,
}: {
  intro?: string
  items: [string, string][]
}) {
  return (
    <div className="flex flex-col gap-2 normal-case tracking-normal">
      {intro && <p className="text-zinc-300 leading-snug">{intro}</p>}
      <div className="flex flex-col gap-1.5">
        {items.map(([label, desc]) => (
          <div key={label} className="leading-snug">
            <span className="text-zinc-200">{label}</span>
            <span className="text-zinc-400"> — {desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// A labeled deck section (#174): an amber section header with an optional help hint.
// Sections own their own header + spacing; the grids inside set the columns.
export function DeckSection({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-1 pt-1.5 pb-2">
      <div className="flex items-center gap-1.5 mb-1.5 h-5">
        <h4 className="text-[11px] font-semibold text-structural uppercase tracking-wider">
          {label}
        </h4>
        {hint && (
          <HelpHint label={`About the ${label} section`} width={320}>
            {hint}
          </HelpHint>
        )}
      </div>
      {children}
    </div>
  )
}

// The deck's shared 2-col label/value grid. Slider cells (label above) and label/value
// cells share the same columns so the whole deck stays aligned. Slider rows keep a
// roomier `gap-y-1.5`; compact label/value rows tighten to `gap-y-1`.
export function DeckGrid({
  gapY = 'gap-y-1.5',
  className = '',
  children,
}: {
  gapY?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`grid grid-cols-2 gap-x-4 ${gapY} items-center ${className}`}>{children}</div>
  )
}

// One label/value cell on the deck's shared grid: label flush left, the control flush
// right.
export function DeckCell({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex justify-between items-center gap-2 min-w-0 ${className}`}>
      <span className="text-zinc-400 truncate">{label}</span>
      {children}
    </div>
  )
}

// A read-only telemetry cell (fps/elapsed/layout/pattern): a DeckCell whose value is
// the live amber readout.
export function DeckTelemetry({ label, value }: { label: string; value: string }) {
  return (
    <DeckCell label={label}>
      <span className="text-live tabular-nums truncate">{value}</span>
    </DeckCell>
  )
}

// A stacked (two-line) read-only stat: label above, the live amber value below — the
// text counterpart to DeckSlider's stacked layout. Use it for a value that needs the
// full cell width (a long pattern name) where the one-line DeckTelemetry would clip.
export function DeckStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-zinc-400 truncate">{label}</span>
      <span className="text-live truncate">{value}</span>
    </div>
  )
}
