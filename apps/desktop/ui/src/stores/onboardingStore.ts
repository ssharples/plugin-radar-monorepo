import { create } from 'zustand'
import type {
  OnboardingState,
  OnboardingActions,
  OnboardingStep,
  BlacklistedPlugin,
  ScanResult,
} from './onboardingTypes'
import { ONBOARDING_STORAGE_KEY } from './onboardingTypes'

const initialState: OnboardingState = {
  isOnboardingComplete: false,
  isInitializing: true,
  currentStep: 'auth' as OnboardingStep,
  authMode: 'login',
  authLoading: false,
  authError: null,
  scanActive: false,
  scanProgress: 0,
  currentPluginName: '',
  pluginsDiscovered: 0,
  scanError: null,
  scanResult: null,
  blacklistedPlugins: [],
  hasEverCompleted: false,
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>((set, get) => ({
  ...initialState,

  initialize: async () => {
    const hasEverCompleted = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true'

    if (hasEverCompleted) {
      // Check if session is still valid
      try {
        const { initializeAuth } = await import('../api/convex-client')
        const hasSession = await initializeAuth()
        if (hasSession) {
          set({ isOnboardingComplete: true, hasEverCompleted: true, isInitializing: false })
          return
        }
      } catch {
        // Session check failed, show auth
      }
      // Has completed before but session expired — show auth, then skip to scan
      set({ hasEverCompleted: true, currentStep: 'auth', isInitializing: false })
    } else {
      set({ hasEverCompleted: false, currentStep: 'auth', isInitializing: false })
    }
  },

  setAuthMode: (mode: 'login' | 'register') => {
    set({ authMode: mode, authError: null })
  },

  submitAuth: async (email: string, password: string, name?: string) => {
    set({ authLoading: true, authError: null })

    try {
      const convexClient = await import('../api/convex-client')
      const state = get()
      let result: { success: boolean; error?: string }

      if (state.authMode === 'register') {
        result = await convexClient.register(email, password, name)
      } else {
        result = await convexClient.login(email, password)
      }

      if (result.success) {
        const { hasEverCompleted } = get()
        // Returning users already have plugins scanned — skip straight to completion
        set({
          authLoading: false,
          authError: null,
          currentStep: hasEverCompleted ? 'complete' : 'scan',
        })
        return true
      } else {
        set({ authLoading: false, authError: result.error || 'Authentication failed' })
        return false
      }
    } catch (err) {
      set({ authLoading: false, authError: String(err) })
      return false
    }
  },

  startScan: () => {
    const scanStartTime = Date.now()
    set({
      scanActive: true,
      scanProgress: 0,
      currentPluginName: '',
      pluginsDiscovered: 0,
      scanError: null,
      blacklistedPlugins: [],
      scanResult: null,
    })

    // Store scan start time in closure for duration calc
    const store = get()
    ;(store as any)._scanStartTime = scanStartTime
  },

  skipScan: () => {
    const result: ScanResult = {
      totalDiscovered: 0,
      totalBlacklisted: 0,
      blacklistedPlugins: [],
      scanDurationMs: 0,
    }
    set({
      scanActive: false,
      scanResult: result,
      currentStep: 'scan-results',
    })
  },

  handleScanProgress: (progress: number, currentPlugin: string) => {
    set({ scanProgress: progress, currentPluginName: currentPlugin })
  },

  handlePluginDiscovered: (count?: number) => {
    if (count !== undefined) {
      set({ pluginsDiscovered: count })
    } else {
      set((state) => ({ pluginsDiscovered: state.pluginsDiscovered + 1 }))
    }
  },

  handlePluginBlacklisted: (plugin: BlacklistedPlugin) => {
    set((state) => ({
      blacklistedPlugins: [...state.blacklistedPlugins, plugin],
    }))
  },

  handleScanComplete: async () => {
    const state = get()
    const scanStartTime = (state as any)._scanStartTime ?? Date.now()

    // If pluginsDiscovered is 0, fetch real count from JUCE bridge
    // This handles fast rescans where pluginListChanged fires after completion
    let totalDiscovered = state.pluginsDiscovered
    if (totalDiscovered === 0) {
      try {
        const { juceBridge } = await import('../api/juce-bridge')
        const plugins = await juceBridge.getPluginList()
        if (Array.isArray(plugins)) {
          totalDiscovered = plugins.length
        }
      } catch {
        // Fall back to counter
      }
    }

    const result: ScanResult = {
      totalDiscovered,
      totalBlacklisted: state.blacklistedPlugins.length,
      blacklistedPlugins: state.blacklistedPlugins,
      scanDurationMs: Date.now() - scanStartTime,
    }
    set({
      scanActive: false,
      scanProgress: 1,
      scanResult: result,
      currentStep: 'scan-results',
    })
  },

  handleScanError: (error: string) => {
    set({ scanActive: false, scanError: error })
  },

  continueFromResults: () => {
    set({ currentStep: 'complete' })
  },

  rescan: () => {
    set({ currentStep: 'scan', scanResult: null })
  },

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
    set({ isOnboardingComplete: true, hasEverCompleted: true })
  },

  resetOnboarding: () => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    set({ ...initialState })
  },
}))
