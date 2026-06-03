import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerPanel } from './ControllerPanel'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
} from '@/store/controllerPanelStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerStatus,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'

class ConnectedProvider extends NullControllerProvider {
  config: ControllerConfig = {
    brightness: 0.4,
    activeProgramId: 'def',
    activeControls: { sliderSpeed: 0.3, toggleMirror: 1 },
  }
  telemetry: ControllerTelemetry = { fps: 30 }
  programs: ProgramListEntry[] = [{ id: 'def', name: 'Nebula' }]
  vars: Record<string, number> = { phase: 0.5 }
  brightnessWrites: Array<{ value: number; save: boolean }> = []
  controlWrites: Array<{ controls: Record<string, number>; save: boolean }> = []
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9', name: 'Living Room' },
  }
  getStatus(): ControllerStatus {
    return this.status
  }
  getConfig() {
    return Promise.resolve(this.config)
  }
  getTelemetry() {
    return Promise.resolve(this.telemetry)
  }
  listPrograms() {
    return Promise.resolve(this.programs)
  }
  getVars() {
    return Promise.resolve(this.vars)
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
}

beforeEach(() => {
  useControllerPanelStore.setState(controllerPanelInitialState)
})

afterEach(() => {
  useControllerPanelStore.getState().stop()
  resetControllerProvider()
})

describe('ControllerPanel', () => {
  it('renders nothing when no Controller is connected', () => {
    // Default registry provider is the NullControllerProvider (no-helper).
    const { container } = render(<ControllerPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the active pattern, fps, and brightness when connected', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)
    expect(screen.getByTestId('controller-panel')).toBeInTheDocument()
    expect(screen.getByText('Living Room')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Nebula')).toBeInTheDocument())
    expect(screen.getByText('30.0')).toBeInTheDocument()
    expect(screen.getByLabelText('Controller brightness')).toBeInTheDocument()
  })

  it('renders the running pattern controls and watched vars when connected', async () => {
    setControllerProvider(new ConnectedProvider())
    render(<ControllerPanel />)
    await waitFor(() => expect(screen.getByLabelText('sliderSpeed')).toBeInTheDocument())
    expect(screen.getByLabelText('toggleMirror')).toBeInTheDocument()
    // Watched var name + formatted value.
    expect(screen.getByText('phase')).toBeInTheDocument()
    expect(screen.getByText('0.50')).toBeInTheDocument()
  })

  it('writes a control through the provider (volatile) when a slider moves', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)
    const slider = await screen.findByLabelText('sliderSpeed')
    fireEvent.change(slider, { target: { value: '0.8' } })
    await waitFor(() =>
      expect(provider.controlWrites[provider.controlWrites.length - 1]).toEqual({
        controls: { sliderSpeed: 0.8 },
        save: false,
      }),
    )
  })

  it('writes brightness through the provider when the slider moves', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)
    const slider = screen.getByLabelText('Controller brightness')
    fireEvent.change(slider, { target: { value: '0.7' } })
    await waitFor(() =>
      expect(provider.brightnessWrites[provider.brightnessWrites.length - 1]).toEqual({
        value: 0.7,
        save: false,
      }),
    )
  })
})
