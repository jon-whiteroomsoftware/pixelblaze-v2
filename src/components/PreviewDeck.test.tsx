import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewDeck } from './PreviewDeck'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('PreviewDeck (smoke)', () => {
  it('renders the deck sections inline (no dialog over the canvas)', () => {
    useEditorStore.setState({ nativeDim: 2, previewPatternName: 'Demo' })
    render(<PreviewDeck />)

    // Primary band: play/pause + the viewport embedding control (Surface for 2D).
    expect(screen.getByRole('button', { name: /run|pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Surface' })).toBeInTheDocument()

    // Pixelblaze section: the Map control now lives here (#253), alongside pixel
    // count + fit, with brightness as a long slider.
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()

    // Preview section: light size, diffusion sliders + renderer, speed.
    expect(screen.getByRole('slider', { name: 'Light size' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Diffusion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renderer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speed' })).toBeInTheDocument()

    // Telemetry (merged in from the retired Readout section) is unconditional.
    expect(screen.getByText('fps')).toBeInTheDocument()
    expect(screen.getByText('elapsed')).toBeInTheDocument()

    // No gear settings dialog exists anymore.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview settings/i })).not.toBeInTheDocument()
  })

  it('omits the map and fit controls for a mapless 1D pattern', () => {
    useEditorStore.setState({ nativeDim: 1 })
    render(<PreviewDeck />)
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Map normalization (Fill / Contain)' }),
    ).not.toBeInTheDocument()
    // The rest of the Pixelblaze block is still present.
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
  })

  it('offers an info hint on both the Pixelblaze and Preview sections', () => {
    render(<PreviewDeck />)
    expect(
      screen.getByRole('button', { name: 'About the Pixelblaze section' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'About the Preview section' }),
    ).toBeInTheDocument()
  })

  it('shows the layout telemetry cell only when a regular grid is live', () => {
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByText('layout')).not.toBeInTheDocument()

    useEditorStore.setState({ layoutLabel: '10×10' })
    rerender(<PreviewDeck />)
    expect(screen.getByText('layout')).toBeInTheDocument()
    expect(screen.getByText('10×10')).toBeInTheDocument()
  })

  it('shows the solidity slider only when the embedding is solid-eligible', () => {
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByRole('slider', { name: /Interior opacity/ })).not.toBeInTheDocument()

    useEditorStore.setState({ solidEligible: true })
    rerender(<PreviewDeck />)
    expect(screen.getByRole('slider', { name: /Interior opacity/ })).toBeInTheDocument()
  })

  it('hides the reset-preview icon until the active item carries overrides', () => {
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByRole('button', { name: 'Reset preview' })).not.toBeInTheDocument()

    // A user pattern with an override surfaces the icon.
    usePatternStore.setState({
      activePatternId: 'p1',
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings: { brightness: 0.5 } }],
    })
    rerender(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Reset preview' })).toBeInTheDocument()
  })

  it('surfaces the same reset-preview icon for a demo with overrides', () => {
    usePatternStore.setState({
      activePatternId: null,
      activeDemoName: 'AuroraSphere',
      demoOverrides: { AuroraSphere: { brightness: 0.5 } },
    })
    render(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Reset preview' })).toBeInTheDocument()
  })
})
