export type OnboardingStep = 'auth' | 'scan' | 'scan-results' | 'complete'

export type ScanFailureReason = 'crash' | 'scan-failure' | 'timeout'

export interface BlacklistedPlugin {
  path: string
  name: string
  reason: ScanFailureReason
}

export interface ScanResult {
  totalDiscovered: number
  totalBlacklisted: number
  blacklistedPlugins: BlacklistedPlugin[]
  scanDurationMs: number
}

export interface OnboardingState {
  isOnboardingComplete: boolean
  currentStep: OnboardingStep
  authMode: 'login' | 'register'
  authLoading: boolean
  authError: string | null
  scanActive: boolean
  scanProgress: number
  currentPluginName: string
  pluginsDiscovered: number
  scanError: string | null
  scanResult: ScanResult | null
  blacklistedPlugins: BlacklistedPlugin[]
  hasEverCompleted: boolean
}

export interface OnboardingActions {
  initialize: () => Promise<void>
  setAuthMode: (mode: 'login' | 'register') => void
  submitAuth: (email: string, password: string, name?: string) => Promise<boolean>
  startScan: () => void
  skipScan: () => void
  handleScanProgress: (progress: number, currentPlugin: string) => void
  handlePluginDiscovered: () => void
  handlePluginBlacklisted: (plugin: BlacklistedPlugin) => void
  handleScanComplete: () => void
  handleScanError: (error: string) => void
  continueFromResults: () => void
  rescan: () => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}

export const ONBOARDING_STORAGE_KEY = 'pluginradar_onboarding_complete'
