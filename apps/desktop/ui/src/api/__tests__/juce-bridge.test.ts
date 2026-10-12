import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the bridge's event subscription logic by importing and inspecting
// the class structure. Since the bridge is a singleton that reads window.__JUCE__,
// we mock at the module level.

describe('juce-bridge events', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('pluginBlacklisted is in the event subscription list', async () => {
    // The events array is set up in setupEventListeners().
    // We verify by constructing a bridge with a mock __JUCE__ that tracks addEventListener calls.
    const addedEvents: string[] = []

    ;(window as any).__JUCE__ = {
      backend: {
        addEventListener: (event: string, _handler: unknown) => {
          addedEvents.push(event)
        },
        removeEventListener: vi.fn(),
      },
    }

    // Re-import to trigger constructor with our mock
    const { juceBridge } = await import('../juce-bridge')
    expect(juceBridge).toBeDefined()
    expect(addedEvents).toContain('pluginBlacklisted')
    expect(addedEvents).toContain('blacklistChanged')

    // Clean up
    ;(window as any).__JUCE__ = undefined
  })

  it('onPluginBlacklisted calls handler with event data', async () => {
    ;(window as any).__JUCE__ = {
      backend: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    }

    const { juceBridge } = await import('../juce-bridge')

    const handler = vi.fn()
    juceBridge.onPluginBlacklisted(handler)

    // Simulate the event via the on() mechanism
    const testData = { path: '/test/plugin.component', name: 'TestPlugin', reason: 'crash' }
    // Access internal emitLocalEvent via the on/emit pattern
    ;(juceBridge as any).emitLocalEvent('pluginBlacklisted', testData)

    expect(handler).toHaveBeenCalledWith(testData)
    expect(handler).toHaveBeenCalledTimes(1)

    // Clean up
    ;(window as any).__JUCE__ = undefined
  })

  it('onPluginBlacklisted unsubscribe removes handler', async () => {
    ;(window as any).__JUCE__ = {
      backend: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    }

    const { juceBridge } = await import('../juce-bridge')

    const handler = vi.fn()
    const unsub = juceBridge.onPluginBlacklisted(handler)

    unsub()

    ;(juceBridge as any).emitLocalEvent('pluginBlacklisted', { path: '/test', name: 'T', reason: 'crash' })
    expect(handler).not.toHaveBeenCalled()

    ;(window as any).__JUCE__ = undefined
  })
})
