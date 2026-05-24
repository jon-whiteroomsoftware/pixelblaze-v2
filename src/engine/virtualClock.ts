export interface VirtualClock {
  advance(ms: number): void
  getTime(): number
  reset(): void
}

export function createVirtualClock(): VirtualClock {
  let time = 0
  return {
    advance(ms) { time += ms },
    getTime() { return time },
    reset() { time = 0 },
  }
}
