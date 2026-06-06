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
  curve = 1,
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
  /** Position-vs-value curve. `1` (default) is linear. Values > 1 devote more of the
   *  track's travel to the low end of the range — e.g. `curve={2.5}` on a 0..1
   *  brightness slider gives fine control at the dim end where the eye is most
   *  sensitive, while the value passed to/from `onChange`/`value` stays in real units.
   *  The mapping is a gamma curve on the normalized fraction, so it reaches both
   *  endpoints exactly (unlike a true log scale, which can't hit 0). */
  curve?: number
  className?: string
}) {
  const indeterminate = value == null
  // With a non-linear curve the range input runs in normalized *position* space
  // [0,1]; we gamma-map position <-> value so callers still deal in real units.
  const curved = curve !== 1
  const span = max - min
  const toPos = (v: number) => (span <= 0 ? 0 : ((v - min) / span) ** (1 / curve))
  const fromPos = (p: number) => {
    // Do NOT quantize to `step` here: `step` is the coarse *readout* granularity, and
    // applying it to the curved value collapses the dense low end of the track to 0
    // (every position under step/2 rounds to zero, so dragging left "pops" to off).
    // The position step already discretizes travel; we only trim binary-float noise.
    return Number((min + span * p ** curve).toFixed(10))
  }
  const sliderMin = curved ? 0 : min
  const sliderMax = curved ? 1 : max
  // A fine position step keeps the curved track smooth; value is re-quantized to `step`.
  const sliderStep = curved ? 0.001 : step
  const sliderValue = indeterminate
    ? (sliderMin + sliderMax) / 2
    : curved
      ? toPos(value)
      : value
  const handleChange = (raw: number) => onChange(curved ? fromPos(raw) : raw)
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={ariaLabel ?? label}
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          // Indeterminate: a hollow accent ring centered on an empty track (no fill
          // that would imply a value) — reads as an interactive, not-yet-set control,
          // not a disabled one. Stays enabled: dragging is how the user sets it.
          value={sliderValue}
          onChange={(e) => handleChange(Number(e.target.value))}
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
