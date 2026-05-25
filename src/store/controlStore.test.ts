import { useControlStore, controlInitialState, type ControlValue } from './controlStore'

beforeEach(() => {
  useControlStore.setState(controlInitialState)
})

describe('controlStore', () => {
  it('starts with no control values', () => {
    expect(useControlStore.getState().controlValues).toEqual({})
  })

  it('sets a single control value', () => {
    useControlStore.getState().setControlValue('sliderSpeed', 0.75)
    expect(useControlStore.getState().controlValues['sliderSpeed']).toBe(0.75)
  })

  it('sets multiple control values independently', () => {
    useControlStore.getState().setControlValue('sliderSpeed', 0.3)
    useControlStore.getState().setControlValue('toggleInvert', 1)
    const { controlValues } = useControlStore.getState()
    expect(controlValues['sliderSpeed']).toBe(0.3)
    expect(controlValues['toggleInvert']).toBe(1)
  })

  it('resetControls replaces all values with the given defaults', () => {
    useControlStore.getState().setControlValue('sliderSpeed', 0.9)
    useControlStore.getState().resetControls({ sliderSpeed: 0.5, toggleInvert: 0 })
    expect(useControlStore.getState().controlValues).toEqual({ sliderSpeed: 0.5, toggleInvert: 0 })
  })

  it('resetControls clears values not in the new defaults', () => {
    useControlStore.getState().setControlValue('sliderOld', 0.8)
    useControlStore.getState().resetControls({ sliderNew: 0.5 })
    expect(useControlStore.getState().controlValues['sliderOld']).toBeUndefined()
  })

  it('stores picker triplet values', () => {
    const triplet: ControlValue = [0.1, 0.8, 1.0]
    useControlStore.getState().setControlValue('hsvPickerColor', triplet)
    expect(useControlStore.getState().controlValues['hsvPickerColor']).toEqual([0.1, 0.8, 1.0])
  })

  it('resetControls accepts picker triplet defaults', () => {
    useControlStore.getState().resetControls({ hsvPickerColor: [0, 1, 1] })
    expect(useControlStore.getState().controlValues['hsvPickerColor']).toEqual([0, 1, 1])
  })
})
