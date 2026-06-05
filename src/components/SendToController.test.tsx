import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SendToController } from './SendToController'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9' },
  }
  getStatus(): ControllerStatus {
    return this.status
  }
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
})

afterEach(() => resetControllerProvider())

describe('SendToController', () => {
  it('is disabled with an explanation when no Controller is connected', () => {
    render(<SendToController />)
    const button = screen.getByTestId('send-to-controller')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/connect a controller/i))
  })

  it('is enabled when connected and the dimensions match', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('is disabled on a dimensionality mismatch, explaining why', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 1 } },
    })
    render(<SendToController />)
    const button = screen.getByTestId('send-to-controller')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/2D.*1D/))
  })

  it('runs the preflight (requestPush) on click when enabled', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    const requestPush = vi.fn()
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      requestPush,
    })
    render(<SendToController />)
    fireEvent.click(screen.getByTestId('send-to-controller'))
    expect(requestPush).toHaveBeenCalledOnce()
  })

  it('keeps the full label and disables while a push is in flight', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Burner Bag', phase: 'live', mapDim: 2 } },
      pushing: true,
    })
    render(<SendToController />)
    const button = screen.getByTestId('send-to-controller')
    // The name is held (no collapse); only the leading glyph (spinner) shows.
    expect(button).toHaveTextContent('Burner Bag')
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button).toBeDisabled()
  })

  const connectActive = () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
  }

  it('flips the armed mode when the Save toggle is clicked', () => {
    connectActive()
    render(<SendToController />)
    const toggle = screen.getByTestId('save-toggle')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(useControllerStore.getState().saveArmed).toBe(true)
  })

  it('tooltips Play when run-armed and Save when save-armed', () => {
    connectActive()
    const { rerender } = render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveAttribute(
      'title',
      expect.stringMatching(/play on desk/i),
    )
    useControllerStore.setState({ saveArmed: true })
    rerender(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveAttribute(
      'title',
      expect.stringMatching(/save to desk/i),
    )
  })

  it('re-enables Send when the toggle is flipped after a clean push of the other mode', () => {
    connectActive()
    useEditorStore.setState({ previewSource: 'export function render() {}' })
    // A clean run push: the run record matches the current source, so run-mode Send
    // is inert — but save-mode Send must stay enabled (saving is not yet done).
    useControllerStore.setState({
      lastPushedSource: { '10.0.0.9': { p1: 'export function render() {}' } },
    })
    usePatternStore.setState({ activePatternId: 'p1' })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toBeDisabled()
    fireEvent.click(screen.getByTestId('save-toggle'))
    expect(screen.getByTestId('send-to-controller')).toBeEnabled()
  })

  it('names the action after the active Controller', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<SendToController />)
    expect(screen.getByTestId('send-to-controller')).toHaveTextContent('Desk')
  })
})
