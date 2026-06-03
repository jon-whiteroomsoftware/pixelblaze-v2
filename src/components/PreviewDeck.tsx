import { useState, type ReactNode } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { usePreviewStore, MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore, defaultPixelCountForDim } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import {
  writeCascadedOverride,
  writeHybrid,
  resetActiveSettings,
  hasActiveOverrides,
} from '@/store/settingsCascade'
import { clampPixelCount } from '@/engine/camera'
import { effectivePixelCount } from '@/engine/layout'
import { LayoutSelector } from '@/components/LayoutSelector'
import { SpeedSelector } from '@/components/SpeedSelector'
import { DeckSelect } from '@/components/DeckSelect'
import { DeckSlider } from '@/components/DeckSlider'
import { ControlsPanel } from '@/components/ControlsPanel'
import { Variables } from '@/components/Variables'

// The preview control deck (#150): everything below the canvas, stacked by visual
// prominence. Primary band = the pattern name, layout, and play/pause; secondary
// band = the remaining controls split into a Pixelblaze group (real device settings)
// and a Preview group (renderer-only constructs + the read-only telemetry that used
// to be its own Readout section — both are preview-only, so they share one section);
// then the author's pattern controls; then the Variables turn-down.
export function PreviewDeck() {
  return (
    <div className="font-mono pl-3">
      <PrimaryBand />
      <SecondaryBand />
      <ControlsPanel />
      <Variables />
    </div>
  )
}

function PrimaryBand() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)

  // The layer-1 reset affordance (ADR-0013, #63): a rewind icon sitting immediately to
  // the right of the pattern name in the primary nav — findable, and clearly scoped to
  // the whole preview rather than buried mid-deck below the controls it resets. It pops
  // in only when the active pattern/demo carries overrides to clear (so it's never a
  // no-op) — a demo reverts to its developer recommendation, a user pattern to the app
  // defaults (resetActiveSettings picks the floor). We subscribe to the override sources
  // so it appears/disappears live as controls are touched; the divergence check itself is
  // `hasActiveOverrides()`. Clicking resets and the icon disappears.
  usePatternStore((s) => s.activePatternId)
  usePatternStore((s) => s.activeDemoName)
  usePatternStore((s) => s.userPatterns)
  usePatternStore((s) => s.demoOverrides)
  const showReset = hasActiveOverrides()

  // The name truncates first; LayoutSelector and play/pause never do (both `shrink-0`),
  // so the controls stay fully readable and only the title gives up space (#63).
  return (
    <div className="flex items-center gap-3 py-2 pr-3 border-b border-zinc-800">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="min-w-0 truncate text-sm text-zinc-200">
          {previewPatternName || '—'}
        </span>
        {showReset && (
          <button
            type="button"
            aria-label="Reset preview"
            title="Reset preview"
            onClick={() => void resetActiveSettings()}
            className="flex items-center justify-center h-5 w-5 shrink-0 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
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

  // The effective modeled count, via the same `effectivePixelCount` selector the
  // renderer feeds every layout branch through (ADR-0004) — the per-pattern value
  // (already seeded with any demo recommendation by the cascade, ADR-0013), else the
  // dimension's default. Keyed off the layout's coordinate dimension (nativeDim), not
  // the viewport dimension, so the box reads the count actually rendered. (No `baked`
  // slot: the deck has no resolved map.)
  const effectiveCount = effectivePixelCount({
    persisted: activePixelCount,
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
    writeCascadedOverride('pixelCount', n)
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
      className="w-[42px] h-5 px-0.5 rounded border border-zinc-500 text-[11px] tabular-nums text-zinc-300 text-center bg-transparent hover:border-zinc-400 focus:outline-none focus:border-live"
    />
  )
}

// Secondary band: the viewport controls, in two labeled sections (#174) that make
// visible the boundary the ADRs already draw in code — real Pixelblaze device
// settings (pixels, fit, brightness) that exist on hardware and would round-trip to a
// controller, vs the preview-only Preview section (light size, diffusion, solidity,
// renderer, speed — ADR-0006/0011, "never serialize toward a controller") which also
// absorbs the read-only telemetry (fps/elapsed/layout). All sliders use the one shared
// long DeckSlider style; non-slider rows stay on the deck's 2-col label/value grid.
function SecondaryBand() {
  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const setLightSize = usePreviewStore((s) => s.setLightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const setDiffusion = usePreviewStore((s) => s.setDiffusion)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const setFidelity = usePreviewStore((s) => s.setFidelity)
  const fps = usePreviewStore((s) => s.fps)
  const elapsed = usePreviewStore((s) => s.elapsed)
  const layoutLabel = useEditorStore((s) => s.layoutLabel)
  // Fill/Contain (#174): a real Mapper map-coordinate normalization setting, so it
  // sits in the Pixelblaze section. Contain (default) preserves aspect; Fill stretches
  // each axis to fill the unit square. Persisted per-pattern.
  const normalizeMode = useMapStore((s) => s.activeNormalizeMode)
  const setNormalizeMode = useMapStore((s) => s.setActiveNormalizeMode)
  // Solidity (ADR-0011) rides in the Preview section only when the active embedding is
  // solid-eligible (it supplies a per-point normal); it appears/disappears as a unit
  // with that embedding. The canonical term is `solidity`; the slider is labelled
  // by its physical spectrum, Transparent ↔ Solid.
  const solidEligible = useEditorStore((s) => s.solidEligible)
  const solidity = useMapStore((s) => s.activeSolidity)
  const setSolidity = useMapStore((s) => s.setActiveSolidity)

  return (
    <div className="text-xs pr-3">
      <Section label="Pixelblaze">
        <Grid gapY="gap-y-1">
          {/* pixels + fit on top, brightness in the bottom-left column below pixels. */}
          <Cell label="pixels">
            <PixelCountInput />
          </Cell>
          <Cell label="fit">
            <DeckSelect
              ariaLabel="Map normalization (Fill / Contain)"
              value={normalizeMode}
              options={[
                { value: 'contain', label: 'Contain', title: 'Contain — keep aspect ratio, fit the longest axis' },
                { value: 'fill', label: 'Fill', title: 'Fill — stretch each axis to fill the unit square' },
              ]}
              onChange={(mode) => {
                setNormalizeMode(mode)
                writeCascadedOverride('normalize', mode)
              }}
              menuWidthClass="w-28"
            />
          </Cell>
          <DeckSlider
            label="brightness"
            ariaLabel="Brightness"
            value={brightness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setBrightness(v)
              writeCascadedOverride('brightness', v)
            }}
          />
        </Grid>
      </Section>
      <Section label="Preview">
        {/* Sliders on top, then renderer/speed dropdowns, then read-only telemetry at
            the bottom of the section (#63). */}
        <Grid className="mb-2">
          <DeckSlider
            label="light size"
            ariaLabel="Light size"
            value={lightSize}
            min={MIN_LIGHT_SIZE}
            max={MAX_LIGHT_SIZE}
            step={0.05}
            onChange={(v) => {
              setLightSize(v)
              writeHybrid('lightSize', v)
            }}
          />
          <DeckSlider
            label="diffusion"
            ariaLabel="Diffusion"
            value={diffusion}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setDiffusion(v)
              writeHybrid('diffusion', v)
            }}
          />
          {solidEligible && (
            <DeckSlider
              label="solidity"
              ariaLabel="Solidity (Transparent ↔ Solid)"
              value={solidity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => {
                setSolidity(v)
                writeCascadedOverride('solidity', v)
              }}
            />
          )}
        </Grid>
        <Grid gapY="gap-y-1" className="mb-2">
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
        </Grid>
        {/* Pull the telemetry text up (#63): the dropdown row above is 20px tall (text
            vertically centered), so without this the renderer→fps text baselines sit
            farther apart than the pure-text telemetry rows below. The negative top
            margin cancels the prior grid's mb-2 plus the dropdown's centering slack, so
            the fps baseline lands the same distance below renderer as elapsed/layout is
            below fps — keeping the text-line rhythm even. */}
        <Grid gapY="gap-y-1" className="mb-2 -mt-1.5">
          <Telemetry label="fps" value={fps === null ? '—' : fps.toFixed(1)} />
          <Telemetry label="elapsed" value={elapsed === null ? '—' : `${(elapsed / 1000).toFixed(1)}s`} />
          {layoutLabel && <Telemetry label="layout" value={layoutLabel} />}
        </Grid>
      </Section>
    </div>
  )
}

// A labeled deck section (#174): the same amber section header the Controls / Variables
// sections use. Sections own their own header + spacing; the grids inside set the
// columns.
function Section({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="mt-1 pt-1.5 pb-2">
      <div className="flex items-center gap-1.5 mb-1.5 h-5">
        <h4 className="text-[11px] font-semibold text-structural uppercase tracking-wider">
          {label}
        </h4>
      </div>
      {children}
    </div>
  )
}

// The deck's shared 2-col label/value grid. Slider cells (label above) and label/value
// cells share the same columns so the whole deck stays aligned. Slider rows keep a
// roomier `gap-y-1.5`; compact label/value rows tighten to `gap-y-1`.
function Grid({
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
function Cell({
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

// A read-only telemetry cell (fps/elapsed/layout): a Cell whose value is the live amber
// readout. Merged in from the retired standalone Readout section.
function Telemetry({ label, value }: { label: string; value: string }) {
  return (
    <Cell label={label}>
      <span className="text-live tabular-nums truncate">{value}</span>
    </Cell>
  )
}
