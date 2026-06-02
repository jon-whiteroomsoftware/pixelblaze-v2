import { useEditorStore } from '@/store/editorStore'
import { useControlStore, type ControlValue } from '@/store/controlStore'
import { DeckSlider } from '@/components/DeckSlider'

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  const s = max === 0 ? 0 : d / max
  const v = max
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, s, v]
}

function tripletToHex(kind: string, value: ControlValue): string {
  const v = Array.isArray(value) ? value : [1, 1, 1]
  if (kind === 'hsvPicker') {
    const [r, g, b] = hsvToRgb(v[0], v[1], v[2])
    return rgbToHex(r, g, b)
  }
  return rgbToHex(v[0], v[1], v[2])
}

export function ControlsPanel() {
  const controls = useEditorStore((s) => s.controls)
  const controlValues = useControlStore((s) => s.controlValues)
  const setControlValue = useControlStore((s) => s.setControlValue)

  const sliders = controls.filter((c) => c.kind === 'slider')
  const toggles = controls.filter((c) => c.kind === 'toggle')
  const pickers = controls.filter((c) => c.kind === 'hsvPicker' || c.kind === 'rgbPicker')
  if (sliders.length + toggles.length + pickers.length === 0) return null

  const renderSlider = (c: (typeof controls)[number]) => {
    const raw = controlValues[c.exportName]
    const value = typeof raw === 'number' ? raw : 0.5
    return (
      <DeckSlider
        key={c.exportName}
        label={c.label.toLowerCase()}
        value={value}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setControlValue(c.exportName, v)}
      />
    )
  }

  const renderToggle = (c: (typeof controls)[number]) => {
    const raw = controlValues[c.exportName]
    const value = typeof raw === 'number' ? raw : 0
    return (
      <label key={c.exportName} className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={value === 1}
          onChange={(e) => setControlValue(c.exportName, e.target.checked ? 1 : 0)}
          className="accent-live shrink-0"
        />
        <span className="text-zinc-400">{c.label.toLowerCase()}</span>
      </label>
    )
  }

  const renderPicker = (c: (typeof controls)[number]) => {
    const raw = controlValues[c.exportName]
    const hex = tripletToHex(c.kind, raw ?? [1, 1, 1])
    return (
      <label key={c.exportName} className="flex items-center gap-2">
        <span className="text-zinc-400 flex-1">{c.label.toLowerCase()}</span>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const [r, g, b] = hexToRgb(e.target.value)
            const triplet: [number, number, number] =
              c.kind === 'hsvPicker' ? rgbToHsv(r, g, b) : [r, g, b]
            setControlValue(c.exportName, triplet)
          }}
          className="w-8 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
        />
      </label>
    )
  }

  return (
    <div className="font-mono text-xs mt-1 pt-1.5 pb-3 pr-3">
      <h4 className="text-[11px] font-semibold text-structural uppercase tracking-wider mb-2">
        Pattern controls
      </h4>
      <div className="flex flex-col gap-2">
        {sliders.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{sliders.map(renderSlider)}</div>
        )}
        {toggles.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{toggles.map(renderToggle)}</div>
        )}
        {pickers.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{pickers.map(renderPicker)}</div>
        )}
      </div>
    </div>
  )
}
