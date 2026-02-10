import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingFlow } from '../OnboardingFlow'
import { useOnboardingStore } from '../../../stores/onboardingStore'
import { ONBOARDING_STORAGE_KEY } from '../../../stores/onboardingTypes'

// Mock juce-bridge
vi.mock('../../../api/juce-bridge', () => ({
  juceBridge: {
    startScan: vi.fn().mockResolvedValue({ success: true }),
    onScanProgress: vi.fn(() => () => {}),
    onPluginListChanged: vi.fn(() => () => {}),
    onPluginBlacklisted: vi.fn(() => () => {}),
    startWaveformStream: vi.fn().mockResolvedValue({}),
    stopWaveformStream: vi.fn().mockResolvedValue({}),
  },
}))

// Mock convex-client
vi.mock('../../../api/convex-client', () => ({
  initializeAuth: vi.fn().mockResolvedValue(false),
  login: vi.fn().mockResolvedValue({ success: true }),
  register: vi.fn().mockResolvedValue({ success: true }),
  getCurrentUser: vi.fn().mockResolvedValue({ _id: 'test-user', name: 'Test' }),
}))

// Mock image imports
vi.mock('../../../assets/ui-bg.png', () => ({ default: 'ui-bg.png' }))

describe('OnboardingFlow Integration', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows auth step initially', () => {
    render(<OnboardingFlow />)
    expect(screen.getByText('PROPANE')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
  })

  it('advances from auth to scan on successful login', async () => {
    const user = userEvent.setup()
    render(<OnboardingFlow />)

    await user.type(screen.getByPlaceholderText('Email'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Should now be on scan step
    expect(screen.getByText('Scanning Your Plugins')).toBeInTheDocument()
  })

  it('auth failure keeps user on auth step', async () => {
    const { login } = await import('../../../api/convex-client')
    ;(login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, error: 'Invalid credentials' })

    const user = userEvent.setup()
    render(<OnboardingFlow />)

    await user.type(screen.getByPlaceholderText('Email'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
  })

  it('scan with blacklisted plugins shows warnings in results', async () => {
    const user = userEvent.setup()
    render(<OnboardingFlow />)

    // Login
    await user.type(screen.getByPlaceholderText('Email'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Now on scan step - simulate blacklisted plugin + completion
    act(() => {
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginDiscovered()
      useOnboardingStore.getState().handlePluginBlacklisted({
        path: '/lib/BadPlugin.component',
        name: 'BadPlugin',
        reason: 'crash',
      })
      useOnboardingStore.getState().handleScanComplete()
    })

    // Should be on results step
    expect(screen.getByText('Found 2 Plugins')).toBeInTheDocument()
    expect(screen.getByText('1 issue found')).toBeInTheDocument()
    expect(screen.getByText('BadPlugin')).toBeInTheDocument()
  })

  it('skip scan goes to results with zero counts', async () => {
    const user = userEvent.setup()
    render(<OnboardingFlow />)

    // Login
    await user.type(screen.getByPlaceholderText('Email'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Skip scan
    await user.click(screen.getByText('Skip for now'))

    expect(screen.getByText('Found 0 Plugins')).toBeInTheDocument()
  })

  it('completion persists to localStorage', async () => {
    // Fast-forward to completion step
    useOnboardingStore.setState({ currentStep: 'complete' })
    render(<OnboardingFlow />)

    // Click to complete
    act(() => {
      useOnboardingStore.getState().completeOnboarding()
    })

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true')
    expect(useOnboardingStore.getState().isOnboardingComplete).toBe(true)
  })

  it('rescan from results goes back to scan', async () => {
    // Set up at results step
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: { totalDiscovered: 10, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
    })

    const user = userEvent.setup()
    render(<OnboardingFlow />)

    await user.click(screen.getByText('Rescan All'))

    expect(screen.getByText('Scanning Your Plugins')).toBeInTheDocument()
  })

  it('continue from results goes to completion', async () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: { totalDiscovered: 10, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
    })

    const user = userEvent.setup()
    render(<OnboardingFlow />)

    await user.click(screen.getByText('Continue to Propane'))

    // Should show completion step
    expect(screen.getByText('Welcome to your signal chain')).toBeInTheDocument()
  })
})
