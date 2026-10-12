import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScanStep } from '../ScanStep'
import { useOnboardingStore } from '../../../stores/onboardingStore'

// Mock juce-bridge
vi.mock('../../../api/juce-bridge', () => ({
  juceBridge: {
    startScan: vi.fn().mockResolvedValue({ success: true }),
    onScanProgress: vi.fn(() => () => {}),
    onPluginListChanged: vi.fn(() => () => {}),
    onPluginBlacklisted: vi.fn(() => () => {}),
  },
}))

describe('ScanStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
    vi.clearAllMocks()
  })

  it('shows scanning heading', () => {
    render(<ScanStep />)
    expect(screen.getByText('Scanning Your Plugins')).toBeInTheDocument()
  })

  it('shows explanation text', () => {
    render(<ScanStep />)
    expect(screen.getByText(/finding all au & vst3 plugins/i)).toBeInTheDocument()
  })

  it('shows progress percentage after update', () => {
    render(<ScanStep />)
    // Simulate progress update after mount
    act(() => {
      useOnboardingStore.getState().handleScanProgress(0.42, 'SomePlugin')
    })
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('shows discovered count after updates', () => {
    render(<ScanStep />)
    act(() => {
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
    })
    expect(screen.getByText('3 plugins found')).toBeInTheDocument()
  })

  it('shows blacklisted warnings after event', () => {
    render(<ScanStep />)
    act(() => {
      useOnboardingStore.getState().handlePluginBlacklisted({
        path: '/lib/CrashedPlugin.component',
        name: 'CrashedPlugin',
        reason: 'crash',
      })
    })
    expect(screen.getByText('CrashedPlugin')).toBeInTheDocument()
  })

  it('shows skip button', () => {
    render(<ScanStep />)
    expect(screen.getByText('Skip for now')).toBeInTheDocument()
  })

  it('calls skipScan on skip click', async () => {
    const user = userEvent.setup()
    render(<ScanStep />)

    await user.click(screen.getByText('Skip for now'))
    // After skip, store should have transitioned
    expect(useOnboardingStore.getState().currentStep).toBe('scan-results')
  })

  it('shows error and retry button on scan error', () => {
    render(<ScanStep />)
    // Simulate error after mount
    act(() => {
      useOnboardingStore.getState().handleScanError('Scanner helper not found')
    })
    expect(screen.getByText('Scanner helper not found')).toBeInTheDocument()
    expect(screen.getByText('Retry Scan')).toBeInTheDocument()
  })
})
