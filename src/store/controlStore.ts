import { create } from 'zustand'

export type ControlValue = number | [number, number, number]

interface ControlState {
  controlValues: Record<string, ControlValue>
  setControlValue: (name: string, value: ControlValue) => void
  resetControls: (defaults: Record<string, ControlValue>) => void
}

export const controlInitialState = {
  controlValues: {} as Record<string, ControlValue>,
}

export const useControlStore = create<ControlState>()((set) => ({
  ...controlInitialState,
  setControlValue: (name, value) =>
    set((s) => ({ controlValues: { ...s.controlValues, [name]: value } })),
  resetControls: (defaults) => set({ controlValues: { ...defaults } }),
}))
