import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { DEMOS } from '@/pixelblaze/demos'

vi.mock('@/engine/storage', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/engine/storage')>()
  return {
    ...orig,
    listPatterns: vi.fn().mockResolvedValue([
      { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 },
    ]),
    getSetting: vi.fn().mockResolvedValue(undefined),
    setSetting: vi.fn().mockResolvedValue(undefined),
    createPattern: vi.fn().mockResolvedValue(undefined),
    listMaps: vi.fn().mockResolvedValue([]),
    deleteMap: vi.fn().mockResolvedValue(undefined),
  }
})

import { createPattern, listMaps } from '@/engine/storage'

beforeEach(() => {
  vi.clearAllMocks()
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
})

const CUSTOM_MAP: MapRecord = {
  id: 'm1',
  name: 'My Tree',
  dim: 3,
  generator: 'custom',
  params: {},
  points: [[0.1, 0.2, 0.3]],
  updatedAt: 1000,
}

async function switchToMaps(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Maps' }))
}

describe('PatternList', () => {
  it('opens AuroraSphere for visitors without a saved last-active pattern', async () => {
    render(<PatternList />)

    await waitFor(() => {
      expect(usePatternStore.getState().activeDemoName).toBe('AuroraSphere')
    })
    expect(usePatternStore.getState().activePatternId).toBeNull()
    expect(useEditorStore.getState().previewPatternName).toBe('AuroraSphere')
    expect(useEditorStore.getState().previewSource).toBe(DEMOS.AuroraSphere)
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(createPattern).not.toHaveBeenCalled()
  })

  it('clicking a demo sets previewSource to the demo source', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewSource).toBe(DEMOS[demoName])
  })

  it('clicking a demo sets previewPatternName to the demo name', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewPatternName).toBe(demoName)
  })

  it('moves between focused demo rows with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const firstRow = screen.getByText(/^Kishimisu$/).closest('li')
    const nextRow = screen.getByText(/^NeonSquircles$/).closest('li')
    expect(firstRow).toBeInTheDocument()
    expect(nextRow).toBeInTheDocument()

    await user.click(firstRow!)
    firstRow!.focus()
    await user.keyboard('{ArrowDown}')

    expect(useEditorStore.getState().previewPatternName).toBe('NeonSquircles')
    expect(nextRow).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(useEditorStore.getState().previewPatternName).toBe('Kishimisu')
    expect(firstRow).toHaveFocus()
  })

  it('shows the empty state when there are no custom maps', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('No custom maps yet')).toBeInTheDocument()
  })

  it('lists user-authored custom maps under "Your Maps"', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()
  })

  it('shows stock maps in Maps mode but not in Patterns mode', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    expect(screen.queryByText('Stock Maps')).not.toBeInTheDocument()
    await switchToMaps(user)
    expect(screen.getByText('Stock Maps')).toBeInTheDocument()
    expect(screen.getByText('Cube shell')).toBeInTheDocument()
  })

  it('hides the 1D dimension lens in Maps mode', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    expect(screen.queryByRole('radio', { name: '1D' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2D' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3D' })).toBeInTheDocument()
  })

  it('switches the dimension lens from 1D to 2D when entering Maps mode', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: '1D' }))
    expect(screen.getByRole('radio', { name: '1D' })).toHaveAttribute('aria-checked', 'true')

    await switchToMaps(user)

    expect(screen.queryByRole('radio', { name: '1D' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true')
  })

  it('filters maps by name via the type-down search box', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.type(search, 'tree')
    expect(screen.getByText('My Tree')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'xyz')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
  })

  it('does not show the "no maps yet" empty state when a filter merely empties the list', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /search by name/i }), 'nope')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
    // Header stays, but the genuine-empty message must not appear.
    expect(screen.getByText('Your Maps')).toBeInTheDocument()
    expect(screen.queryByText('No custom maps yet')).not.toBeInTheDocument()
  })

  it('AND-combines the search query with the dimension lens', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    // Query matches but lens (2D) does not -> hidden.
    await user.type(screen.getByRole('textbox', { name: /search by name/i }), 'tree')
    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    // Both match -> visible.
    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('surfaces a search hit inside a collapsed group, then restores collapse when cleared', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    // Pick a demo and its OpenGL-style subsection isn't guaranteed, so collapse the
    // top-level "Demos" group, which hides every demo.
    const demoName = Object.keys(DEMOS).sort()[0]
    expect(await screen.findByText(new RegExp(`^${demoName}`))).toBeInTheDocument()
    await user.click(screen.getByText('Demos'))
    expect(screen.queryByText(new RegExp(`^${demoName}`))).not.toBeInTheDocument()

    // A search matching that demo must surface it despite the collapse.
    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.type(search, demoName)
    expect(screen.getByText(new RegExp(`^${demoName}`))).toBeInTheDocument()

    // Clearing the query restores the user's collapsed layout.
    await user.clear(search)
    expect(screen.queryByText(new RegExp(`^${demoName}`))).not.toBeInTheDocument()
  })

  it('clicking the search icon focuses the input', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })
    expect(search).not.toHaveFocus()

    await user.click(screen.getByRole('button', { name: /search by name/i }))
    expect(search).toHaveFocus()
  })

  it('clicking the icon while open closes and unfocuses the search input', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })

    // Open + focus it; the icon now offers Close.
    await user.click(screen.getByRole('button', { name: /search by name/i }))
    expect(search).toHaveFocus()
    const closeBtn = screen.getByRole('button', { name: /close search/i })

    // Clicking Close drops focus and clears any query.
    await user.type(search, 'abc')
    await user.click(closeBtn)
    expect(search).not.toHaveFocus()
    expect(search).toHaveValue('')
    // And the affordance reverts to "Search by name".
    expect(screen.getByRole('button', { name: /search by name/i })).toBeInTheDocument()
  })

  it('clicking elsewhere in the IDE closes the search box and clears its query', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.click(screen.getByRole('button', { name: /search by name/i }))
    await user.type(search, 'abc')
    expect(search).toHaveFocus()

    // A click on an unrelated part of the rail blurs the input.
    await user.click(screen.getByText('Demos'))

    expect(search).not.toHaveFocus()
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: /search by name/i })).toBeInTheDocument()
  })

  it('shows a 3D custom map under the 3D lens but not the 2D lens', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('opening a stock map does not change the active preview map', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    await user.click(screen.getByText('Cube shell'))
    expect(useMapStore.getState().editingMap).toEqual({ kind: 'stock', id: 'cube-shell' })
    expect(useMapStore.getState().activeMapId).toBe('plane')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
  })
})
