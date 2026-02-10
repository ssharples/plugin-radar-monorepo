import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useOnboardingStore } from '../onboardingStore'
import { ONBOARDING_STORAGE_KEY } from '../onboardingTypes'
import type { BlacklistedPlugin } from '../onboardingTypes'

// Mock convex-client
vi.mock('../../api/convex-client', () => ({
  initializeAuth: vi.fn().mockResolvedValue(false),
  login: vi.fn().mockResolvedValue({ success: true }),
  register: vi.fn().mockResolvedValue({ success: true }),
  logout: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue({ _id: 'test-user', name: 'Test', email: 'test@test.com' }),
}))

describe('onboardingStore', () => {
  beforeEach(() => {
    // Reset store
    useOnboardingStore.getState().resetOnboarding()
    localStorage.clear()
    vi.clearAllMocks()
  })

  // ============================
  // Initialization
  // ============================
  describe('initialization', () => {
    it('starts at auth step by default', () => {
      const state = useOnboardingStore.getState()
      expect(state.currentStep).toBe('auth')
      expect(state.isOnboardingComplete).toBe(false)
    })

    it('defaults authMode to login', () => {
      const state = useOnboardingStore.getState()
      expect(state.authMode).toBe('login')
    })

    it('reads hasEverCompleted from localStorage on initialize', async () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      await useOnboardingStore.getState().initialize()
      const state = useOnboardingStore.getState()
      expect(state.hasEverCompleted).toBe(true)
    })

    it('marks complete if localStorage flag set AND valid session', async () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      const { initializeAuth } = await import('../../api/convex-client')
      ;(initializeAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

      await useOnboardingStore.getState().initialize()
      const state = useOnboardingStore.getState()
      expect(state.isOnboardingComplete).toBe(true)
    })

    it('shows auth when hasEverCompleted but session expired', async () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      const { initializeAuth } = await import('../../api/convex-client')
      ;(initializeAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)

      await useOnboardingStore.getState().initialize()
      const state = useOnboardingStore.getState()
      expect(state.isOnboardingComplete).toBe(false)
      expect(state.currentStep).toBe('auth')
      expect(state.hasEverCompleted).toBe(true)
    })

    it('does not skip onboarding when no localStorage flag', async () => {
      await useOnboardingStore.getState().initialize()
      const state = useOnboardingStore.getState()
      expect(state.isOnboardingComplete).toBe(false)
      expect(state.hasEverCompleted).toBe(false)
    })
  })

  // ============================
  // Auth step
  // ============================
  describe('auth step', () => {
    it('toggles auth mode between login and register', () => {
      useOnboardingStore.getState().setAuthMode('register')
      expect(useOnboardingStore.getState().authMode).toBe('register')

      useOnboardingStore.getState().setAuthMode('login')
      expect(useOnboardingStore.getState().authMode).toBe('login')
    })

    it('clears auth error when switching modes', () => {
      useOnboardingStore.setState({ authError: 'some error' })
      useOnboardingStore.getState().setAuthMode('register')
      expect(useOnboardingStore.getState().authError).toBeNull()
    })

    it('sets authLoading during submitAuth', async () => {
      const { login } = await import('../../api/convex-client')
      ;(login as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 50))
      )

      const promise = useOnboardingStore.getState().submitAuth('test@test.com', 'pass')
      expect(useOnboardingStore.getState().authLoading).toBe(true)
      await promise
      expect(useOnboardingStore.getState().authLoading).toBe(false)
    })

    it('advances to scan step on successful login', async () => {
      const result = await useOnboardingStore.getState().submitAuth('test@test.com', 'pass')
      expect(result).toBe(true)
      expect(useOnboardingStore.getState().currentStep).toBe('scan')
    })

    it('stays on auth with error on failed login', async () => {
      const { login } = await import('../../api/convex-client')
      ;(login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, error: 'Invalid credentials' })

      const result = await useOnboardingStore.getState().submitAuth('test@test.com', 'wrong')
      expect(result).toBe(false)
      expect(useOnboardingStore.getState().currentStep).toBe('auth')
      expect(useOnboardingStore.getState().authError).toBe('Invalid credentials')
    })

    it('calls register when authMode is register', async () => {
      useOnboardingStore.getState().setAuthMode('register')
      const { register } = await import('../../api/convex-client')

      await useOnboardingStore.getState().submitAuth('test@test.com', 'pass', 'Test User')
      expect(register).toHaveBeenCalledWith('test@test.com', 'pass', 'Test User')
    })

    it('calls login when authMode is login', async () => {
      const { login } = await import('../../api/convex-client')
      await useOnboardingStore.getState().submitAuth('test@test.com', 'pass')
      expect(login).toHaveBeenCalledWith('test@test.com', 'pass')
    })
  })

  // ============================
  // Scan step
  // ============================
  describe('scan step', () => {
    it('starts scan with initial state', () => {
      useOnboardingStore.getState().startScan()
      const state = useOnboardingStore.getState()
      expect(state.scanActive).toBe(true)
      expect(state.scanProgress).toBe(0)
      expect(state.pluginsDiscovered).toBe(0)
      expect(state.blacklistedPlugins).toEqual([])
      expect(state.scanError).toBeNull()
    })

    it('updates progress from scan events', () => {
      useOnboardingStore.getState().startScan()
      useOnboardingStore.getState().handleScanProgress(0.5, '/Library/Audio/Plug-Ins/FabFilter Pro-Q 3.component')
      const state = useOnboardingStore.getState()
      expect(state.scanProgress).toBe(0.5)
      expect(state.currentPluginName).toBe('/Library/Audio/Plug-Ins/FabFilter Pro-Q 3.component')
    })

    it('increments pluginsDiscovered', () => {
      useOnboardingStore.getState().startScan()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
      expect(useOnboardingStore.getState().pluginsDiscovered).toBe(3)
    })

    it('collects blacklisted plugins', () => {
      useOnboardingStore.getState().startScan()
      const plugin: BlacklistedPlugin = {
        path: '/Library/Audio/Plug-Ins/Components/CrashedPlugin.component',
        name: 'CrashedPlugin',
        reason: 'crash',
      }
      useOnboardingStore.getState().handlePluginBlacklisted(plugin)
      expect(useOnboardingStore.getState().blacklistedPlugins).toHaveLength(1)
      expect(useOnboardingStore.getState().blacklistedPlugins[0]).toEqual(plugin)
    })

    it('transitions to scan-results on completion', () => {
      useOnboardingStore.getState().startScan()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handleScanComplete()

      const state = useOnboardingStore.getState()
      expect(state.scanActive).toBe(false)
      expect(state.currentStep).toBe('scan-results')
      expect(state.scanResult).not.toBeNull()
      expect(state.scanResult!.totalDiscovered).toBe(2)
    })

    it('records scanDurationMs on completion', () => {
      useOnboardingStore.getState().startScan()
      // Simulate some time passing
      useOnboardingStore.getState().handleScanComplete()

      const state = useOnboardingStore.getState()
      expect(state.scanResult!.scanDurationMs).toBeGreaterThanOrEqual(0)
    })

    it('allows skip to go to results with zero counts', () => {
      useOnboardingStore.setState({ currentStep: 'scan' })
      useOnboardingStore.getState().skipScan()

      const state = useOnboardingStore.getState()
      expect(state.currentStep).toBe('scan-results')
      expect(state.scanResult).not.toBeNull()
      expect(state.scanResult!.totalDiscovered).toBe(0)
      expect(state.scanResult!.totalBlacklisted).toBe(0)
    })

    it('handles scan errors', () => {
      useOnboardingStore.getState().startScan()
      useOnboardingStore.getState().handleScanError('Scanner helper not found')

      const state = useOnboardingStore.getState()
      expect(state.scanActive).toBe(false)
      expect(state.scanError).toBe('Scanner helper not found')
    })

    it('includes blacklisted plugins in scan result', () => {
      useOnboardingStore.getState().startScan()
      const plugin: BlacklistedPlugin = {
        path: '/Library/Audio/iLokPlugin.component',
        name: 'iLokPlugin',
        reason: 'scan-failure',
      }
      useOnboardingStore.getState().handlePluginBlacklisted(plugin)
      useOnboardingStore.getState().handleScanComplete()

      const state = useOnboardingStore.getState()
      expect(state.scanResult!.totalBlacklisted).toBe(1)
      expect(state.scanResult!.blacklistedPlugins[0].reason).toBe('scan-failure')
    })
  })

  // ============================
  // Results step
  // ============================
  describe('results step', () => {
    it('continues from results to complete', () => {
      useOnboardingStore.setState({ currentStep: 'scan-results' })
      useOnboardingStore.getState().continueFromResults()
      expect(useOnboardingStore.getState().currentStep).toBe('complete')
    })

    it('allows rescan from results', () => {
      useOnboardingStore.setState({
        currentStep: 'scan-results',
        scanResult: { totalDiscovered: 5, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
      })
      useOnboardingStore.getState().rescan()
      expect(useOnboardingStore.getState().currentStep).toBe('scan')
      expect(useOnboardingStore.getState().scanResult).toBeNull()
    })
  })

  // ============================
  // Complete step
  // ============================
  describe('complete step', () => {
    it('sets isOnboardingComplete to true', () => {
      useOnboardingStore.getState().completeOnboarding()
      expect(useOnboardingStore.getState().isOnboardingComplete).toBe(true)
    })

    it('persists to localStorage', () => {
      useOnboardingStore.getState().completeOnboarding()
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true')
    })

    it('sets hasEverCompleted', () => {
      useOnboardingStore.getState().completeOnboarding()
      expect(useOnboardingStore.getState().hasEverCompleted).toBe(true)
    })
  })

  // ============================
  // Persistence
  // ============================
  describe('persistence', () => {
    it('resetOnboarding clears localStorage', () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      useOnboardingStore.getState().resetOnboarding()
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull()
    })

    it('resetOnboarding resets all state', () => {
      useOnboardingStore.setState({
        isOnboardingComplete: true,
        currentStep: 'complete',
        authMode: 'register',
        scanActive: true,
        pluginsDiscovered: 42,
      })
      useOnboardingStore.getState().resetOnboarding()

      const state = useOnboardingStore.getState()
      expect(state.isOnboardingComplete).toBe(false)
      expect(state.currentStep).toBe('auth')
      expect(state.authMode).toBe('login')
      expect(state.scanActive).toBe(false)
      expect(state.pluginsDiscovered).toBe(0)
    })
  })
})
