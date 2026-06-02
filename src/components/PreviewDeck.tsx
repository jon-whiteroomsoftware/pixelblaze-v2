import { useState, type ReactNode } from 'react'
import { Play, Pause } from 'lucide-react'
import { usePreviewStore, MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, defaultPixelCountForDim } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { recommendedPixelCountFor } from '@/pixelblaze/demos'
import { clampPixelCount } from '@/engine/camera'
import { effectivePixelCount } from '@/engine/layout'
import { LayoutSelector } from '@/components/LayoutSelector'
import { SpeedSelector } from '@/components/SpeedSelector'
import { DeckSelect } from '@/components/DeckSelect'
import { ControlsPanel } from '@/components/ControlsPanel'
import { Readout } from '@/components/Readout'
import { Variables } from '@/components/Variables'

// The preview control deck (#150): everything below the canvas, stacked by visual
// prominence. Primary band = the pattern name, layout, and play/pause; secondary
// band = the remaining controls split into a Pixelblaze group (real device settings)
// and a Preview group (renderer-only constructs) — #174; then the read-only Readout
// (fps/elapsed/layout outrank author controls); then the author's pattern controls;
// then the Variables turn-down. Replaces the over-the-canvas gear dialog.
export function PreviewDeck() {
  return (
    <div className="font-mono pl-3">
      <PrimaryBand />
      <SecondaryBand />
      <Readout />
      <ControlsPanel />
      <Variables />
    </div>
  )
}

function PrimaryBand() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)

  return (
    <div className="flex items-center gap-3 py-2 pr-3 border-b border-zinc-800">
      <span className="flex-1 min-w-0 text-sm text-zinc-200 truncate">
        {previewPatternName || '—'}
      </span>
      <LayoutSelector />
      <button
        aria-label={isRunning ? 'Pause' : 'Run'}
        onClick={toggle}
        className={`flex items-center justify-center w-8 h-8 rounded shrink-0 hover:bg-zinc-700 transition-colors ${
          isRunning ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'
        }`}
      >
        {isRunning ? <Play size={20} /> : <Pause size={20} />}
      </button>
    </div>
  )
}

// Inline pixel-count control (#150): the count is now an editable control in the
// deck, not a read-only echo. Draft/commit logic lifted from the old settings dialog
// — the draft tracks edits until Enter/blur commits a clamped value to the store.
function PixelCountInput() {
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const setActivePixelCount = useMapStore((s) => s.setActivePixelCount)
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)

  // The effective modeled count, via the same `effectivePixelCount` selector the
  // renderer feeds every layout branch through (ADR-0004) — the per-pattern value,
  // else a demo's recommended count, else the dimension's default. Keyed off the
  // layout's coordinate dimension (nativeDim), not the viewport dimension, so the box
  // reads the count actually rendered. (No `baked` slot: the deck has no resolved map.)
  const effectiveCount = effectivePixelCount({
    persisted: activePixelCount,
    recommended: recommendedPixelCountFor(activeDemoName),
    fallback: defaultPixelCountForDim(nativeDim),
  })
  const [draftCount, setDraftCount] = useState(String(effectiveCount))

  // Reflect external count changes (pattern switch, default per dimension) into the
  // draft by adjusting state during render (React's recommended pattern over an effect).
  const [lastCount, setLastCount] = useState(effectiveCount)
  if (effectiveCount !== lastCount) {
    setLastCount(effectiveCount)
    setDraftCount(String(effectiveCount))
  }

  function commit() {
    const n = clampPixelCount(parseInt(draftCount, 10) || effectiveCount)
    setDraftCount(String(n))
    setActivePixelCount(n)
  }

  return (
    <input
      aria-label="Pixel count"
      type="text"
      inputMode="numeric"
      value={draftCount}
      onChange={(e) => setDraftCount(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      onBlur={commit}
      className="w-12 h-6 px-0.5 rounded border border-zinc-700 text-[11px] tabular-nums text-zinc-300 text-center bg-transparent hover:border-zinc-500 focus:outline-none focus:border-amber-500"
    />
  )
}

// Secondary band: the viewport controls, split into two labeled groups (#174) that
// make visible the boundary the ADRs already draw in code — real Pixelblaze device
// settings (pixels, brightness, fill/contain) that exist on hardware and would
// round-trip to a controller, vs preview-only constructs the IDE renderer invents
// (light size, diffusion, renderer, speed, solidity — ADR-0006/0011, "never
// serialize toward a controller"). Each group is its own label/value grid, aligned
// on the SAME columns as the Readout below (#150). Sliders are short; they don't
// need the full cell width to be usable.
function SecondaryBand() {
  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const setLightSize = usePreviewStore((s) => s.setLightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const setDiffusion = usePreviewStore((s) => s.setDiffusion)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const setFidelity = usePreviewStore((s) => s.setFidelity)
  // Fill/Contain (#174): a real Mapper map-coordinate normalization setting, so it
  // sits in the Pixelblaze group. Contain (default) preserves aspect; Fill stretches
  // each axis to fill the unit square. Persisted per-pattern (beside solidity).
  const normalizeMode = useMapStore((s) => s.activeNormalizeMode)
  const setNormalizeMode = useMapStore((s) => s.setActiveNormalizeMode)
  // Solidity (ADR-0011) rides in the Preview group only when the active embedding is
  // solid-eligible (it supplies a per-point normal); it appears/disappears as a unit
  // with that embedding. The canonical term is `solidity`; the slider is labelled
  // by its physical spectrum, Transparent ↔ Solid.
  const solidEligible = useEditorStore((s) => s.solidEligible)
  const solidity = useMapStore((s) => s.activeSolidity)
  const setSolidity = useMapStore((s) => s.setActiveSolidity)

  return (
    <div className="text-xs pr-3">
      <Group label="Pixelblaze">
        <Cell label="pixels">
          <PixelCountInput />
        </Cell>
        <Cell label="brightness">
          <input
            type="range"
            aria-label="Brightness"
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="w-12 accent-amber-500"
          />
        </Cell>
        <Cell label="fit">
          <DeckSelect
            ariaLabel="Map normalization (Fill / Contain)"
            value={normalizeMode}
            options={[
              { value: 'contain', label: 'Contain', title: 'Contain — keep aspect ratio, fit the longest axis' },
              { value: 'fill', label: 'Fill', title: 'Fill — stretch each axis to fill the unit square' },
            ]}
            onChange={setNormalizeMode}
            menuWidthClass="w-28"
          />
        </Cell>
      </Group>
      <Group label="Preview">
        <Cell label="light size">
          <input
            type="range"
            aria-label="Light size"
            min={MIN_LIGHT_SIZE}
            max={MAX_LIGHT_SIZE}
            step={0.05}
            value={lightSize}
            onChange={(e) => setLightSize(Number(e.target.value))}
            className="w-12 accent-amber-500"
          />
        </Cell>
        <Cell label="diffusion">
          <input
            type="range"
            aria-label="Diffusion"
            min={0}
            max={1}
            step={0.01}
            value={diffusion}
            onChange={(e) => setDiffusion(Number(e.target.value))}
            className="w-12 accent-amber-500"
          />
        </Cell>
        <Cell label="renderer">
          <DeckSelect
            ariaLabel="Renderer"
            value={fidelity}
            options={[
              { value: 'fast', label: 'Fast', title: 'Fast (float64, plain JS preview)' },
              { value: 'fidelity', label: 'Precise', title: 'Precise (16.16 fixed-point, hardware-accurate)' },
            ]}
            onChange={setFidelity}
            menuWidthClass="w-28"
          />
        </Cell>
        <Cell label="speed">
          <SpeedSelector />
        </Cell>
        {solidEligible && (
          <Cell label="solidity">
            <input
              type="range"
              aria-label="Solidity (Transparent ↔ Solid)"
              min={0}
              max={1}
              step={0.01}
              value={solidity}
              onChange={(e) => setSolidity(Number(e.target.value))}
              className="w-12 accent-amber-500"
            />
          </Cell>
        )}
      </Group>
    </div>
  )
}

// A labeled group of deck cells (#174): the same amber section header the Readout /
// Controls / Variables sections use, over the deck's shared 2-col label/value grid —
// so the Pixelblaze-vs-Preview split reads as two sections consistent with the rest
// of the deck, without breaking the column alignment.
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-1 pt-1.5 pb-3">
      <h4 className="text-[11px] font-semibold text-amber-500/60 uppercase tracking-wider mb-2">
        {label}
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 items-center">{children}</div>
    </div>
  )
}

// One label/value cell on the deck's shared grid: label flush left (matching the
// Readout's zinc-400 labels), the control flush right.
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2 min-w-0">
      <span className="text-zinc-400 truncate">{label}</span>
      {children}
    </div>
  )
}
