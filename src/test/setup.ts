import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
