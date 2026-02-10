import '@testing-library/jest-dom'

// Mock window.__JUCE__ to prevent crashes on module import
Object.defineProperty(window, '__JUCE__', {
  value: undefined,
  writable: true,
  configurable: true,
})

// Provide a working localStorage mock for jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})
