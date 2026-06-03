import { render, screen, fireEvent } from '@testing-library/react'
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
    expect(pill).toHaveAttribute('title', '10.0.0.5')
    expect(screen.getByTestId('controller-pill-dot')).toBeInTheDocument()
    // With a pill present, the entry affordance collapses to a compact add button.
    expect(screen.getByTestId('controller-entry-button')).toHaveTextContent('+')
  })

  it('a pending pill labels by IP', () => {
    useControllerStore.setState({
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'pending', mapDim: null } },
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
    fireEvent.click(screen.getByRole('button', { name: 'Activate A' }))
    expect(useControllerStore.getState().activeIp).toBe('10.0.0.5')
  })
})
