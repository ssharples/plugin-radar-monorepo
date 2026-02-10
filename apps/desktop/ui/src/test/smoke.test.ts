import { describe, it, expect } from 'vitest'

describe('Test infrastructure', () => {
  it('vitest runs correctly', () => {
    expect(1 + 1).toBe(2)
  })

  it('jsdom environment is available', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})
