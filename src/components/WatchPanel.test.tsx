import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WatchPanel } from './WatchPanel'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('WatchPanel layout readout', () => {
  it('shows the layout label Preview published (2D grid)', () => {
    useEditorStore.setState({ layoutLabel: '10×10' })
    render(<WatchPanel />)
    expect(screen.getByText('layout')).toBeInTheDocument()
    expect(screen.getByText('10×10')).toBeInTheDocument()
  })

  it('shows the 3D layout (width×height×depth)', () => {
    useEditorStore.setState({ layoutLabel: '8×8×8' })
    render(<WatchPanel />)
    expect(screen.getByText('8×8×8')).toBeInTheDocument()
  })

  it('keeps a 2D readout when a 2D layout is drawn in a 3D viewport (cylinder)', () => {
    // displayDim is 3 (orbit viewport) but the layout stays a 2D grid.
    useEditorStore.setState({ displayDim: 3, layoutLabel: '40×13' })
    render(<WatchPanel />)
    expect(screen.getByText('40×13')).toBeInTheDocument()
  })

  it('shows no layout cell when there is no regular grid', () => {
    useEditorStore.setState({ layoutLabel: null })
    render(<WatchPanel />)
    expect(screen.queryByText('layout')).not.toBeInTheDocument()
  })
})
