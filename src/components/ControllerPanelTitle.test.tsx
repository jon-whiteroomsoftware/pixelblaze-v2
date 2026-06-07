import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ControllerPanelTitle } from './ControllerPanelTitle'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
} from '@/store/controllerPanelStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'

beforeEach(() => {
  useControllerPanelStore.setState(controllerPanelInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('ControllerPanelTitle', () => {
  it('shows the running pattern name resolved from the device program list', () => {
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      programs: [{ id: 'def', name: 'Nebula' }],
    })
    render(<ControllerPanelTitle />)
    expect(screen.getByText('Nebula')).toBeInTheDocument()
  })

  it('flags a run-only program with an unsaved marker (#237)', () => {
    useControllerPanelStore.setState({
      activeProgramId: 'run-xyz',
      programs: [],
      programLabels: { 'run-xyz': 'My Sketch' },
    })
    render(<ControllerPanelTitle />)
    expect(screen.getByText('My Sketch')).toBeInTheDocument()
    expect(screen.getByTestId('controller-pattern-unsaved')).toBeInTheDocument()
  })

  it('recovers dimensionality by resolving the running name to a built-in demo', () => {
    // NebulaSphere is a stock 3D demo; the title scans its source for render fns.
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      programs: [{ id: 'def', name: 'NebulaSphere' }],
    })
    render(<ControllerPanelTitle />)
    expect(screen.getByText('3D')).toBeInTheDocument()
  })

  it('recovers dimensionality from a matching saved user pattern', () => {
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      programs: [{ id: 'def', name: 'My 2D Sketch' }],
    })
    usePatternStore.setState({
      userPatterns: [
        {
          id: 'u1',
          name: 'My 2D Sketch',
          src: 'export function render2D(index, x, y) {}',
          controls: {},
          updatedAt: 0,
        },
      ],
    })
    render(<ControllerPanelTitle />)
    expect(screen.getByText('2D')).toBeInTheDocument()
  })

  it('omits the dim pill when the running pattern is not held locally', () => {
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      programs: [{ id: 'def', name: 'SomeForeignPattern' }],
    })
    render(<ControllerPanelTitle />)
    expect(screen.queryByText(/\dD/)).not.toBeInTheDocument()
  })
})
