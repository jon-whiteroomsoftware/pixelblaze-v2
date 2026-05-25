import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
