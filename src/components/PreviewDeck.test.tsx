import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewDeck } from './PreviewDeck'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('PreviewDeck (smoke)', () => {
  it('renders the deck sections inline (no dialog over the canvas)', () => {
    useEditorStore.setState({ nativeDim: 2, previewPatternName: 'Demo' })
    render(<PreviewDeck />)

    // Primary band: play/pause + pixel count + layout (Map control).
    expect(screen.getByRole('button', { name: /run|pause/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()

    // Pixelblaze section: brightness is now a long slider alongside pixels + fit.
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
    expect(screen.queryByRole('slider', { name: /Solidity/ })).not.toBeInTheDocument()

    useEditorStore.setState({ solidEligible: true })
    rerender(<PreviewDeck />)
    expect(screen.getByRole('slider', { name: /Solidity/ })).toBeInTheDocument()
  })
})
