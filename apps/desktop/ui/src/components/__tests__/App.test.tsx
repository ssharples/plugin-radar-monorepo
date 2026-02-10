import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useOnboardingStore } from '../../stores/onboardingStore'

// Mock all heavy dependencies to isolate the App gate logic
vi.mock('../../components/PluginBrowser', () => ({ PluginBrowser: () => <div data-testid="plugin-browser" /> }))
vi.mock('../../components/ChainEditor', () => ({ ChainEditor: () => <div data-testid="chain-editor">Chain Editor</div> }))
vi.mock('../../components/WaveformDisplay', () => ({ WaveformDisplay: () => <div data-testid="waveform" /> }))
vi.mock('../../components/SpectrumAnalyzer', () => ({ SpectrumAnalyzer: () => <div data-testid="spectrum" /> }))
vi.mock('../../components/PresetBrowser', () => ({ PresetModal: () => <div data-testid="preset-modal" /> }))
vi.mock('../../components/Footer', () => ({ Footer: () => <div data-testid="footer">Footer</div> }))
vi.mock('../Onboarding/OnboardingFlow', () => ({ OnboardingFlow: () => <div data-testid="onboarding-flow">Onboarding</div> }))
vi.mock('../../stores/presetStore', () => ({
  usePresetStore: () => ({ currentPreset: null, fetchPresets: vi.fn() }),
}))
vi.mock('../../stores/syncStore', () => ({
  useSyncStore: () => ({ initialize: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../stores/offlineStore', () => ({
  useOfflineStore: () => ({ initialize: vi.fn() }),
  startRetryLoop: vi.fn(),
}))
vi.mock('../../api/convex-client', () => ({
  executeQueuedWrite: vi.fn(),
}))
vi.mock('../../api/juce-bridge', () => ({
  juceBridge: {
    startWaveformStream: vi.fn().mockResolvedValue({}),
    stopWaveformStream: vi.fn().mockResolvedValue({}),
  },
}))
// Mock image imports
vi.mock('../../assets/ui-bg.png', () => ({ default: 'ui-bg.png' }))
vi.mock('../../assets/header.png', () => ({ default: 'header.png' }))
vi.mock('../../assets/analyzer-container.png', () => ({ default: 'analyzer-container.png' }))
vi.mock('../../assets/analyzer-display.png', () => ({ default: 'analyzer-display.png' }))
vi.mock('../../assets/input-button-bg.png', () => ({ default: 'input-button-bg.png' }))

describe('App', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
    vi.clearAllMocks()
  })

  it('renders onboarding when isOnboardingComplete is false', async () => {
    useOnboardingStore.setState({ isOnboardingComplete: false })

    const { default: App } = await import('../../App')
    render(<App />)

    expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument()
  })

  it('renders main app when isOnboardingComplete is true', async () => {
    useOnboardingStore.setState({ isOnboardingComplete: true })

    const { default: App } = await import('../../App')
    render(<App />)

    expect(screen.getByTestId('chain-editor')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })
})
