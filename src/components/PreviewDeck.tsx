import { useState } from 'react'
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
import { MapSelect, EmbeddingSelect } from '@/components/LayoutSelector'
import { SpeedSelector } from '@/components/SpeedSelector'
import { DeckSelect } from '@/components/DeckSelect'
import { DeckSlider } from '@/components/DeckSlider'
import { ControlsPanel } from '@/components/ControlsPanel'
import { Variables } from '@/components/Variables'
import {
  DeckSection,
  DeckSectionHint,
  DeckGrid,
  DeckCell,
  DeckField,
  DeckTelemetry,
} from '@/components/Deck'

// Card content for the two viewport sections. The contrast is the point: the
// Pixelblaze section is real device state that travels to hardware; the Preview
// section is renderer-only and never leaves the browser.
const PIXELBLAZE_HINT = (
  <DeckSectionHint
    items={[
      ['map', 'the pixel map the pattern samples — its layout in real space (2D/3D only)'],
      ['fit', 'how the pixel map is normalized into pattern space — Contain keeps the aspect ratio, Fill stretches each axis to fill it'],
      ['pixel count', 'how many LEDs the pattern drives'],
      ['brightness', 'master output level applied to every pixel'],
    ]}
  />
)

const PREVIEW_HINT = (
  <DeckSectionHint
    intro="Preview only — these controls affect the IDE but are never sent to the controller."
    items={[
      ['light size', 'on-screen size of each rendered LED'],
      ['diffusion', 'soft glow and blending between neighbouring lights'],
      ['solidity', 'for surface maps, how opaque it reads — transparent through solid'],
      ['renderer', 'Fast (plain float math) or Precise (hardware-accurate fixed-point)'],
      ['speed', 'playback rate of the preview clock'],
      ['fps / elapsed / layout', 'live readouts — frame rate, run time, and the active map'],
    ]}
  />
)

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

  // The name truncates first; the embedding control and play/pause never do (both
  // `shrink-0`), so the controls stay fully readable and only the title gives up space
  // (#63). The MAP control no longer lives here — it moved to the PIXELBLAZE block
  // (#253); this row holds only viewport affordances + transport.
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
      <EmbeddingSelect />
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
  // The map+fit row is real Pixelblaze state that only exists for a mapped layout
  // (#253). 1D is mapless, so both the map and its normalization mode (fit) are
  // absent entirely — not shown disabled.
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const hasMap = nativeDim !== 1

  return (
    <div className="text-xs pr-3">
      <DeckSection label="Pixelblaze" hint={PIXELBLAZE_HINT}>
        <DeckGrid>
          {/* Additive layout: row 1 (pixel count + brightness) is present for every
              dimension and never moves; row 2 (fit + map) only appears for a mapped
              2D/3D layout, growing downward rather than reshuffling row 1. Row 1 is
              stacked (label above control) so pixel count aligns to the brightness
              slider; row 2's fit and map are inline label-left/value-right cells. */}
          <DeckField label="pixel count">
            <PixelCountInput />
          </DeckField>
          <DeckSlider
            label="brightness"
            ariaLabel="Brightness"
            value={brightness}
            min={0}
            max={1}
            step={0.01}
            curve={2}
            onChange={(v) => {
              setBrightness(v)
              writeCascadedOverride('brightness', v)
            }}
          />
          {hasMap && (
            <DeckCell label="fit">
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
            </DeckCell>
          )}
          {hasMap && (
            <DeckCell label="map">
              <MapSelect />
            </DeckCell>
          )}
        </DeckGrid>
      </DeckSection>
      <DeckSection label="Preview" hint={PREVIEW_HINT}>
        {/* Sliders on top, then renderer/speed dropdowns, then read-only telemetry at
            the bottom of the section (#63). */}
        <DeckGrid className="mb-2">
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
        </DeckGrid>
        <DeckGrid gapY="gap-y-1" className="mb-2">
          <DeckCell label="renderer">
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
          </DeckCell>
          <DeckCell label="speed">
            <SpeedSelector />
          </DeckCell>
        </DeckGrid>
        {/* Pull the telemetry text up (#63): the dropdown row above is 20px tall (text
            vertically centered), so without this the renderer→fps text baselines sit
            farther apart than the pure-text telemetry rows below. The negative top
            margin cancels the prior grid's mb-2 plus the dropdown's centering slack, so
            the fps baseline lands the same distance below renderer as elapsed/layout is
            below fps — keeping the text-line rhythm even. */}
        <DeckGrid gapY="gap-y-1" className="mb-2 -mt-1.5">
          <DeckTelemetry label="fps" value={fps === null ? '—' : fps.toFixed(1)} />
          <DeckTelemetry label="elapsed" value={elapsed === null ? '—' : `${(elapsed / 1000).toFixed(1)}s`} />
          {layoutLabel && <DeckTelemetry label="layout" value={layoutLabel} />}
        </DeckGrid>
      </DeckSection>
    </div>
  )
}
