import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapSelect, EmbeddingSelect } from './LayoutSelector'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

// The two layout controls now render in separate regions of the deck (#253): the
// MAP control in the PIXELBLAZE block, the EMBEDDING (shape/surface) control in the
// play-button row. They share routing, so the tests render whichever is under test.
describe('MapSelect (smoke)', () => {
  it('shows the active map name for a 2D pattern', () => {
    useEditorStore.setState({ nativeDim: 2 })
    render(<MapSelect />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Square')
  })

  it('shows the active map name for a regular-lattice custom map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-grid',
      userMaps: [
        {
          id: 'cm-grid',
          name: 'My Grid',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0], [0, 1], [1, 1]],
          gridDims: { cols: 2, rows: 2 },
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<MapSelect />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('My Grid')
  })

  it('renders nothing for a mapless 1D pattern', () => {
    useEditorStore.setState({ nativeDim: 1 })
    const { container } = render(<MapSelect />)
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('selecting a map for a 2D pattern routes to the map store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'wide' })
    render(<MapSelect />)
    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('option', { name: 'Square' }))
    expect(useMapStore.getState().activeMapId).toBe('plane')
  })
})

describe('EmbeddingSelect (smoke)', () => {
  it('shows the Surface control for a 2D pattern on a wrappable map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    render(<EmbeddingSelect />)
    expect(screen.getByRole('button', { name: 'Surface' })).toBeInTheDocument()
  })

  it('offers the Surface control for a regular-lattice custom map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-grid',
      userMaps: [
        {
          id: 'cm-grid',
          name: 'My Grid',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0], [0, 1], [1, 1]],
          gridDims: { cols: 2, rows: 2 },
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<EmbeddingSelect />)
    expect(screen.getByRole('button', { name: 'Surface' })).toBeInTheDocument()
  })

  it('hides the embedding control for an irregular custom map (Flat only)', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-cloud',
      userMaps: [
        {
          id: 'cm-cloud',
          name: 'My Cloud',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [0.3, 0.7], [0.9, 0.1]],
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<EmbeddingSelect />)
    expect(screen.queryByRole('button', { name: 'Surface' })).not.toBeInTheDocument()
  })

  it('shows the Shape control for a 1D pattern', () => {
    useEditorStore.setState({ nativeDim: 1 })
    render(<EmbeddingSelect />)
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('lists 1D shapes and routes a choice to the shape store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    render(<EmbeddingSelect />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.click(screen.getByRole('option', { name: 'Ring' }))
    expect(useMapStore.getState().activeShapeId).toBe('ring')
  })

  it('selecting the Cylinder surface routes to the surface store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    render(<EmbeddingSelect />)
    await user.click(screen.getByRole('button', { name: 'Surface' }))
    await user.click(screen.getByRole('option', { name: 'Cylinder' }))
    expect(useMapStore.getState().activeSurfaceId).toBe('cylinder')
  })
})
