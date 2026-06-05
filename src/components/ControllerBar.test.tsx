import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerBar } from './ControllerBar'
import {
  useControllerStore,
  controllerInitialState,
  __resetControllerProviders,
} from '@/store/controllerStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'

beforeEach(() => {
  __resetControllerProviders()
  useControllerStore.setState(controllerInitialState)
})

afterEach(() => {
  __resetControllerProviders()
  resetControllerProvider()
})

describe('ControllerBar', () => {
  it('offers the install pitch when no extension is present', () => {
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    expect(screen.getByTestId('controller-install-pitch')).toBeInTheDocument()
  })

  it('offers the IP form when the extension is present and no Controller is connected', () => {
    useControllerStore.setState({ extensionPresent: true })
    render(<ControllerBar />)
    fireEvent.click(screen.getByTestId('controller-entry-button'))
    expect(screen.getByTestId('controller-ip-input')).toBeInTheDocument()
  })

  it('renders a pill per connected Controller with the nickname and a status dot', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    const pill = screen.getByTestId('controller-pill')
    expect(pill).toHaveTextContent('Desk')
    // The pill carries no IP hover tooltip — the IP shows in the open panel header.
    expect(pill).not.toHaveAttribute('title')
    expect(screen.getByTestId('controller-pill-dot')).toBeInTheDocument()
    // With a pill present, the entry affordance collapses to a compact add button.
    expect(screen.getByTestId('controller-entry-button')).toHaveTextContent('+')
  })

  it('a pending pill keeps a known name (no IP flash on reconnect churn)', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'pending', mapDim: null } },
    })
    render(<ControllerBar />)
    expect(screen.getByTestId('controller-pill')).toHaveTextContent('Desk')
  })

  it('a pending pill with no known name still labels by IP', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', phase: 'pending', mapDim: null } },
    })
    render(<ControllerBar />)
    expect(screen.getByTestId('controller-pill')).toHaveTextContent('10.0.0.5')
  })

  it('activates a Controller on pill click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.6',
      controllers: {
        '10.0.0.5': { ip: '10.0.0.5', nickname: 'A', phase: 'live', mapDim: 2 },
        '10.0.0.6': { ip: '10.0.0.6', nickname: 'B', phase: 'live', mapDim: 2 },
      },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle A panel' }))
    expect(useControllerStore.getState().activeIp).toBe('10.0.0.5')
  })

  it('opens the panel popover (with a Disconnect, no inline remove) when a pill is clicked', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    // No popover (and so no Disconnect) until the pill is clicked.
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('controller-pill-remove')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    const popover = screen.getByTestId('controller-panel-popover')
    expect(popover).toHaveTextContent('Desk')
    expect(popover).toHaveTextContent('10.0.0.5')
    expect(screen.getByTestId('controller-pill-remove')).toHaveAccessibleName('Disconnect Desk')
  })

  it('toggles the panel popover closed on a second pill click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    const pill = screen.getByRole('button', { name: 'Toggle Desk panel' })
    fireEvent.click(pill)
    expect(screen.getByTestId('controller-panel-popover')).toBeInTheDocument()
    fireEvent.click(pill)
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
  })

  it('disconnects from the popover header and closes the popover', async () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    fireEvent.click(screen.getByTestId('controller-pill-remove'))
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(useControllerStore.getState().controllers['10.0.0.5']).toBeUndefined(),
    )
  })

  it('dismisses the pinned popover on an outside click', () => {
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<ControllerBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Desk panel' }))
    expect(screen.getByTestId('controller-panel-popover')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('controller-panel-popover')).not.toBeInTheDocument()
  })
})
