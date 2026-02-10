import { vi } from 'vitest'

export function createMockConvexClient() {
  return {
    initializeAuth: vi.fn().mockResolvedValue(false),
    login: vi.fn().mockResolvedValue({ success: true }),
    register: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue({ _id: 'test-user-id', name: 'Test User', email: 'test@example.com' }),
    syncPlugins: vi.fn().mockResolvedValue({ synced: 0, inCatalog: 0, newPlugins: [], error: null }),
  }
}
