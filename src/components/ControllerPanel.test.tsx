import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerPanel } from './ControllerPanel'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
} from '@/store/controllerPanelStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useControllerStore } from '@/store/controllerStore'
import { setProgramLabels } from '@/engine/storage'
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
    pixelCount: 256,
  }
  telemetry: ControllerTelemetry = { fps: 30 }
  programs: ProgramListEntry[] = [{ id: 'def', name: 'Nebula' }]
  vars: Record<string, number> = { phase: 0.5 }
  brightnessWrites: Array<{ value: number; save: boolean }> = []
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
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
  setPixelCount(value: number, save = true): Promise<void> {
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
}

beforeEach(() => {
  useControllerPanelStore.setState(controllerPanelInitialState)
  useEditorStore.setState(editorInitialState)
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
    // The first section is labeled "Pixelblaze" (matching the preview deck); the
    // device's IP shows in its own box, not as the section header.
    expect(screen.getByText('Pixelblaze')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.9')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Nebula')).toBeInTheDocument())
    expect(screen.getByText('30.0')).toBeInTheDocument()
    expect(screen.getByLabelText('Controller brightness')).toBeInTheDocument()
  })

  it('resolves a run-only program to its label-cache name with an unsaved marker (#237)', async () => {
    // A run-only program id the device list does not know about, but the local label
    // cache (loaded for the active Controller) does.
    await setProgramLabels({ '10.0.0.9': { 'run-xyz': 'My Sketch' } })
    useControllerStore.setState({ activeIp: '10.0.0.9' })
    const provider = new ConnectedProvider()
    provider.config = { ...provider.config, activeProgramId: 'run-xyz' }
    setControllerProvider(provider)
    render(<ControllerPanel />)

    await waitFor(() => expect(screen.getByText('My Sketch')).toBeInTheDocument())
    expect(screen.getByTestId('controller-pattern-unsaved')).toBeInTheDocument()
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

  it('shows the pattern-controls help only when the loaded pattern has descriptions', async () => {
    setControllerProvider(new ConnectedProvider())
    // No description metadata loaded → no help affordance on the controls section.
    const { rerender } = render(<ControllerPanel />)
    await waitFor(() => expect(screen.getByLabelText('sliderSpeed')).toBeInTheDocument())
    expect(
      screen.queryByLabelText('About the pattern controls section'),
    ).not.toBeInTheDocument()

    // Load the matching pattern metadata with a description → the "?" appears, and
    // its content describes the control.
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ])
    rerender(<ControllerPanel />)
    const help = await screen.findByLabelText('About the pattern controls section')
    fireEvent.click(help)
    expect(screen.getByText(/How fast it goes\./)).toBeInTheDocument()
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

  it('shows the device pixel count in an editable field and writes it back (saved) on commit', async () => {
    const provider = new ConnectedProvider()
    setControllerProvider(provider)
    render(<ControllerPanel />)
    const input = (await screen.findByLabelText('Controller pixel count')) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('256'))
    fireEvent.change(input, { target: { value: '16' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(provider.pixelCountWrites[provider.pixelCountWrites.length - 1]).toEqual({
        value: 16,
        save: true,
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
