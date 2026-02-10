import { vi } from 'vitest'
import type { ScanProgress, PluginDescription } from '../../api/types'

type EventHandler<T = unknown> = (data: T) => void

interface MockJuceBridge {
  startScan: ReturnType<typeof vi.fn>
  getPluginList: ReturnType<typeof vi.fn>
  getScanProgress: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  onScanProgress: ReturnType<typeof vi.fn>
  onPluginListChanged: ReturnType<typeof vi.fn>
  onPluginBlacklisted: ReturnType<typeof vi.fn>
  startWaveformStream: ReturnType<typeof vi.fn>
  stopWaveformStream: ReturnType<typeof vi.fn>
  getChainState: ReturnType<typeof vi.fn>
  exportChain: ReturnType<typeof vi.fn>
  // Event simulation helpers
  _eventHandlers: Map<string, Set<EventHandler>>
  _simulateEvent: (event: string, data: unknown) => void
}

export function createMockJuceBridge(): MockJuceBridge {
  const eventHandlers = new Map<string, Set<EventHandler>>()

  const on = vi.fn((event: string, handler: EventHandler) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set())
    }
    eventHandlers.get(event)!.add(handler)
    return () => {
      eventHandlers.get(event)?.delete(handler)
    }
  })

  const bridge: MockJuceBridge = {
    startScan: vi.fn().mockResolvedValue({ success: true }),
    getPluginList: vi.fn().mockResolvedValue([]),
    getScanProgress: vi.fn().mockResolvedValue({ scanning: false, progress: 0, currentPlugin: '' }),
    on,
    onScanProgress: vi.fn((handler: EventHandler<ScanProgress>) => on('scanProgress', handler)),
    onPluginListChanged: vi.fn((handler: EventHandler<PluginDescription[]>) => on('pluginListChanged', handler)),
    onPluginBlacklisted: vi.fn((handler: EventHandler) => on('pluginBlacklisted', handler)),
    startWaveformStream: vi.fn().mockResolvedValue({ success: true }),
    stopWaveformStream: vi.fn().mockResolvedValue({ success: true }),
    getChainState: vi.fn().mockResolvedValue({ nodes: [] }),
    exportChain: vi.fn().mockResolvedValue({ version: 1, numSlots: 0, slots: [] }),
    _eventHandlers: eventHandlers,
    _simulateEvent: (event: string, data: unknown) => {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        handlers.forEach((handler) => handler(data))
      }
    },
  }

  return bridge
}
