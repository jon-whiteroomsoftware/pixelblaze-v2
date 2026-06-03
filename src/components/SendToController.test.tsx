import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SendToController } from './SendToController'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
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

  it('renders the preflight dialog with its warnings, confirming proceeds', () => {
    setControllerProvider(new ConnectedProvider())
    useEditorStore.setState({ nativeDim: 2 })
    const confirmPush = vi.fn()
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
      confirmPush,
      preflight: [{ kind: 'fewer-than-device', message: 'Only 100 of the Controller’s 256 pixels will light up.' }],
    })
    render(<SendToController />)
    expect(screen.getByText(/only 100 of the controller/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/send anyway/i))
    expect(confirmPush).toHaveBeenCalledOnce()
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
