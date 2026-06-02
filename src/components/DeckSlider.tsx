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
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  className?: string
}) {
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
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-2/3 accent-live"
        />
        <span className="flex-1 text-right text-live tabular-nums">{format(value)}</span>
      </div>
    </label>
  )
}
