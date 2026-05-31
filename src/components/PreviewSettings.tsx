import { useState, useRef, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, defaultPixelCountForDim } from '@/store/mapStore'
import { MAX_PIXEL_COUNT, clampPixelCount } from '@/engine/camera'
import { MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'

const PRIMARY_BUILTIN_VARS = ['elapsed', 'pixelCount']

const ADVANCED_BUILTIN_VARS = [
  'energyAverage',
  'light',
  'maxFrequency',
  'maxFrequencyMagnitude',
  'frequencyData',
  'accelerometer',
  'analogInputs',
]

function WatchCheckbox({
  name,
  checked,
  onChange,
}: {
  name: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer min-w-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-amber-500 shrink-0"
      />
      <span className="text-xs text-zinc-300 truncate" title={name}>{name}</span>
    </label>
  )
}

export function PreviewSettings() {
  const [isOpen, setIsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const setDiffusion = usePreviewStore((s) => s.setDiffusion)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const setLightSize = usePreviewStore((s) => s.setLightSize)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const setFidelity = usePreviewStore((s) => s.setFidelity)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const setActivePixelCount = useMapStore((s) => s.setActivePixelCount)
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const watchedBuiltins = usePreviewStore((s) => s.watchedBuiltins)
  const setWatchedBuiltins = usePreviewStore((s) => s.setWatchedBuiltins)
  const watchedPatternVars = usePreviewStore((s) => s.watchedPatternVars)
  const setWatchedPatternVars = usePreviewStore((s) => s.setWatchedPatternVars)
  const patternVars = useEditorStore((s) => s.patternVars)

  // The effective count: the per-pattern value, or the dimension's default when
  // the pattern carries none. Keyed off the layout's coordinate dimension
  // (`nativeDim`), NOT the viewport dimension — a 2D pattern wrapped onto a 3D
  // cylinder still defaults to the 2D count. The draft tracks edits until committed.
  const effectiveCount = activePixelCount ?? defaultPixelCountForDim(nativeDim)
  const [draftCount, setDraftCount] = useState(String(effectiveCount))

  // Reflect external count changes (pattern switch, default per dimension) into
  // the draft by adjusting state during render (React's recommended pattern over
  // an effect): when the effective count moves on its own, re-seed the draft.
  const [lastCount, setLastCount] = useState(effectiveCount)
  if (effectiveCount !== lastCount) {
    setLastCount(effectiveCount)
    setDraftCount(String(effectiveCount))
  }

  function commitPixelCount() {
    const n = clampPixelCount(parseInt(draftCount, 10) || effectiveCount)
    setDraftCount(String(n))
    setActivePixelCount(n)
  }

  function toggleBuiltin(name: string) {
    setWatchedBuiltins(
      watchedBuiltins.includes(name)
        ? watchedBuiltins.filter((v) => v !== name)
        : [...watchedBuiltins, name]
    )
  }

  function togglePatternVar(name: string) {
    setWatchedPatternVars(
      watchedPatternVars.includes(name)
        ? watchedPatternVars.filter((v) => v !== name)
        : [...watchedPatternVars, name]
    )
  }

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Preview settings"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-amber-400/70 hover:bg-zinc-700 transition-colors"
      >
        <Settings size={18} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Preview settings panel"
          className="absolute top-full right-0 mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 p-3 font-mono"
        >
          {/* Display */}
          <section>
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Display
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Brightness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Light size</span>
                <input
                  type="range"
                  min={MIN_LIGHT_SIZE}
                  max={MAX_LIGHT_SIZE}
                  step={0.05}
                  value={lightSize}
                  onChange={(e) => setLightSize(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Diffusion</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={diffusion}
                  onChange={(e) => setDiffusion(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Renderer</span>
                <div
                  role="radiogroup"
                  aria-label="Renderer mode"
                  className="flex rounded border border-zinc-700 overflow-hidden"
                >
                  {([
                    ['fast', 'Fast', 'Fast (float64, plain JS preview)'],
                    ['fidelity', 'Precise', 'Precise (16.16 fixed-point, hardware-accurate)'],
                  ] as const).map(([value, label, title]) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={fidelity === value}
                      title={title}
                      onClick={() => setFidelity(value)}
                      className={`flex-1 px-2 py-1 text-xs transition-colors ${
                        fidelity === value
                          ? 'bg-amber-500/20 text-amber-400 font-semibold'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Pixel Count */}
          <section className="mt-4">
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Pixel Count
            </h3>
            <div className="flex items-center gap-2">
              <input
                aria-label="Pixel count"
                type="number"
                min={1}
                max={MAX_PIXEL_COUNT}
                value={draftCount}
                onChange={(e) => setDraftCount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitPixelCount()}
                onBlur={commitPixelCount}
                className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={commitPixelCount}
                className="px-2 py-1 text-xs rounded border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                OK
              </button>
            </div>
          </section>

          {/* Watch */}
          <section className="mt-4">
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-2">
              Watch
            </h3>

            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Built-ins</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2">
              {PRIMARY_BUILTIN_VARS.map((name) => (
                <WatchCheckbox
                  key={name}
                  name={name}
                  checked={watchedBuiltins.includes(name)}
                  onChange={() => toggleBuiltin(name)}
                />
              ))}
            </div>
            <button
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 mb-1 transition-colors"
            >
              <span>{advancedOpen ? '▾' : '▸'}</span>
              <span>Advanced</span>
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-3 pl-2">
                {ADVANCED_BUILTIN_VARS.map((name) => (
                  <WatchCheckbox
                    key={name}
                    name={name}
                    checked={watchedBuiltins.includes(name)}
                    onChange={() => toggleBuiltin(name)}
                  />
                ))}
              </div>
            )}

            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Variables</p>
            {patternVars.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {patternVars.map((name) => (
                  <WatchCheckbox
                    key={name}
                    name={name}
                    checked={watchedPatternVars.includes(name)}
                    onChange={() => togglePatternVar(name)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">No exported variables</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
