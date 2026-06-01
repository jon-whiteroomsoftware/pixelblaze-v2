import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LayoutSelector } from './LayoutSelector'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('LayoutSelector (smoke)', () => {
  it('shows the active map name for a 2D pattern', () => {
    useEditorStore.setState({ nativeDim: 2 })
    render(<LayoutSelector />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Square')
  })

  it('shows the Map and Surface controls for a 2D pattern on a wrappable map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    render(<LayoutSelector />)
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Surface' })).toBeInTheDocument()
  })

  it('shows only the Shape control for a 1D pattern', () => {
    useEditorStore.setState({ nativeDim: 1 })
    render(<LayoutSelector />)
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('lists 1D shapes and routes a choice to the shape store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    render(<LayoutSelector />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.click(screen.getByRole('option', { name: 'Ring' }))
    expect(useMapStore.getState().activeShapeId).toBe('ring')
  })

  it('selecting a map for a 2D pattern routes to the map store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'wide' })
    render(<LayoutSelector />)
    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('option', { name: 'Square' }))
    expect(useMapStore.getState().activeMapId).toBe('plane')
  })

  it('selecting the Cylinder surface routes to the surface store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    render(<LayoutSelector />)
    await user.click(screen.getByRole('button', { name: 'Surface' }))
    await user.click(screen.getByRole('option', { name: 'Cylinder' }))
    expect(useMapStore.getState().activeSurfaceId).toBe('cylinder')
  })
})
