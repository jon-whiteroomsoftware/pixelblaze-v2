import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LibrariesMenu } from './LibrariesMenu'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()

describe('LibrariesMenu', () => {
  beforeEach(() => {
    useEditorStore.setState(editorInitialState)
    usePatternStore.setState(patternInitialState)
  })

  it('renders the Libraries button collapsed', () => {
    render(<LibrariesMenu />)
    const button = screen.getByTestId('libraries-menu-button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('libraries-menu-dropdown')).not.toBeInTheDocument()
  })

  it('opens the dropdown listing PixelBlaze plus every library', () => {
    render(<LibrariesMenu />)
    fireEvent.click(screen.getByTestId('libraries-menu-button'))
    expect(screen.getByTestId('libraries-menu-dropdown')).toBeInTheDocument()
    const items = screen.getAllByTestId('libraries-menu-item').map((el) => el.textContent)
    expect(items).toContain('PixelBlaze')
    for (const name of LIBRARY_NAMES) expect(items).toContain(name)
  })

  it('opens a library read-only in the editor on click and closes the menu', () => {
    render(<LibrariesMenu />)
    fireEvent.click(screen.getByTestId('libraries-menu-button'))
    const name = LIBRARY_NAMES[0]
    fireEvent.click(screen.getByText(name))
    expect(useEditorStore.getState().source).toBe(LIBRARIES[name])
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(usePatternStore.getState().activeLibraryName).toBe(name)
    expect(screen.queryByTestId('libraries-menu-dropdown')).not.toBeInTheDocument()
  })
})
