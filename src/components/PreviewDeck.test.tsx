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
  it('renders the three prominence bands inline (no dialog over the canvas)', () => {
    useEditorStore.setState({ nativeDim: 2, previewPatternName: 'Demo' })
    render(<PreviewDeck />)

    // Primary band: play/pause + brightness + pixel count + layout (Map control).
    expect(screen.getByRole('button', { name: /run|pause/i })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()

    // Secondary band: light size, diffusion, renderer, speed.
    expect(screen.getByRole('slider', { name: 'Light size' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Diffusion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renderer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speed' })).toBeInTheDocument()

    // Readout telemetry is unconditional.
    expect(screen.getByText('fps')).toBeInTheDocument()
    expect(screen.getByText('elapsed')).toBeInTheDocument()

    // No gear settings dialog exists anymore.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview settings/i })).not.toBeInTheDocument()
  })
})
