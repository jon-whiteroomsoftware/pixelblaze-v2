// The deck's long slider (#150 follow-up): label above a wider track with the live
// numeric value to its right. This is the user-pattern-control slider style, now the
// single shared style for every slider on the preview deck — brightness, light size,
// diffusion, solidity, and the author's pattern sliders — replacing the teensy
// short sliders so each has real travel/granularity and shows its value.
export function DeckSlider({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
  className = '',
}: {
  label: string
  ariaLabel?: string
  /** The current value, or `null` when not yet known — e.g. a live device value
   *  still being read, or a control whose device-reported value is out of range and
   *  so unusable as a position (#speed-slider). A null value renders an
   *  *indeterminate* slider — a dimmed, empty track and a `—` readout — rather than a
   *  misleading 0 (or a wild `2.4e+21`) that pops to a real value once known. The
   *  slider stays draggable while indeterminate: dragging is how the user sets it. */
  value: number | null
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  className?: string
}) {
  const indeterminate = value == null
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={ariaLabel ?? label}
          min={min}
          max={max}
          step={step}
          // Indeterminate: a hollow accent ring centered on an empty track (no fill
          // that would imply a value) — reads as an interactive, not-yet-set control,
          // not a disabled one. Stays enabled: dragging is how the user sets it.
          value={indeterminate ? (min + max) / 2 : value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-2/3 ${indeterminate ? 'deck-slider-unset' : 'accent-live'}`}
        />
        <span
          className={`flex-1 text-right tabular-nums ${indeterminate ? 'text-zinc-500' : 'text-live'}`}
        >
          {indeterminate ? '—' : format(value)}
        </span>
      </div>
    </label>
  )
}
