import { render, screen, act } from '@testing-library/react'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { CompileStatusBadge } from './CompileStatusBadge'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
})

describe('CompileStatusBadge', () => {
  it('shows Good when compileStatus is good', () => {
    useEditorStore.setState({ compileStatus: 'good' })
    render(<CompileStatusBadge />)
    const badge = screen.getByTestId('compile-status')
    expect(badge).toHaveTextContent('Good')
    expect(badge).toHaveAttribute('data-status', 'good')
  })

  it('shows Broken when compileStatus is broken', () => {
    useEditorStore.setState({ compileStatus: 'broken' })
    render(<CompileStatusBadge />)
    const badge = screen.getByTestId('compile-status')
    expect(badge).toHaveTextContent('Broken')
    expect(badge).toHaveAttribute('data-status', 'broken')
  })

  it('updates when store changes', () => {
    useEditorStore.setState({ compileStatus: 'good' })
    render(<CompileStatusBadge />)
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    act(() => { useEditorStore.setState({ compileStatus: 'broken' }) })
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  })
})
