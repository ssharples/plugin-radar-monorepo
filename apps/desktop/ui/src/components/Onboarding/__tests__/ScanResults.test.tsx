import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScanResults } from '../ScanResults'
import { useOnboardingStore } from '../../../stores/onboardingStore'

describe('ScanResults', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
  })

  it('shows total plugins found', () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: {
        totalDiscovered: 42,
        totalBlacklisted: 0,
        blacklistedPlugins: [],
        scanDurationMs: 5000,
      },
    })
    render(<ScanResults />)
    expect(screen.getByText('Found 42 Plugins')).toBeInTheDocument()
  })

  it('shows scan duration', () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: {
        totalDiscovered: 10,
        totalBlacklisted: 0,
        blacklistedPlugins: [],
        scanDurationMs: 3500,
      },
    })
    render(<ScanResults />)
    expect(screen.getByText('Completed in 3.5s')).toBeInTheDocument()
  })

  it('shows blacklisted section when present', () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: {
        totalDiscovered: 40,
        totalBlacklisted: 2,
        blacklistedPlugins: [
          { path: '/lib/A.component', name: 'CrashedPlugin', reason: 'crash' },
          { path: '/lib/B.component', name: 'UnlicensedPlugin', reason: 'scan-failure' },
        ],
        scanDurationMs: 5000,
      },
    })
    render(<ScanResults />)
    expect(screen.getByText('2 issues found')).toBeInTheDocument()
    expect(screen.getByText('CrashedPlugin')).toBeInTheDocument()
    expect(screen.getByText('UnlicensedPlugin')).toBeInTheDocument()
  })

  it('categorizes by failure reason', () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: {
        totalDiscovered: 30,
        totalBlacklisted: 3,
        blacklistedPlugins: [
          { path: '/a', name: 'CrashA', reason: 'crash' },
          { path: '/b', name: 'iLokPlugin', reason: 'scan-failure' },
          { path: '/c', name: 'SlowPlugin', reason: 'timeout' },
        ],
        scanDurationMs: 5000,
      },
    })
    render(<ScanResults />)
    expect(screen.getByText('Crashed')).toBeInTheDocument()
    expect(screen.getByText('Authorization Required')).toBeInTheDocument()
    expect(screen.getByText('Timed Out')).toBeInTheDocument()
  })

  it('shows Continue and Rescan buttons', () => {
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: { totalDiscovered: 10, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
    })
    render(<ScanResults />)
    expect(screen.getByText('Continue to Propane')).toBeInTheDocument()
    expect(screen.getByText('Rescan All')).toBeInTheDocument()
  })

  it('calls continueFromResults on continue click', async () => {
    const user = userEvent.setup()
    const continueSpy = vi.fn()
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: { totalDiscovered: 10, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
      continueFromResults: continueSpy,
    })
    render(<ScanResults />)

    await user.click(screen.getByText('Continue to Propane'))
    expect(continueSpy).toHaveBeenCalled()
  })

  it('calls rescan on rescan click', async () => {
    const user = userEvent.setup()
    const rescanSpy = vi.fn()
    useOnboardingStore.setState({
      currentStep: 'scan-results',
      scanResult: { totalDiscovered: 10, totalBlacklisted: 0, blacklistedPlugins: [], scanDurationMs: 1000 },
      rescan: rescanSpy,
    })
    render(<ScanResults />)

    await user.click(screen.getByText('Rescan All'))
    expect(rescanSpy).toHaveBeenCalled()
  })

  it('renders nothing when scanResult is null', () => {
    useOnboardingStore.setState({ currentStep: 'scan-results', scanResult: null })
    const { container } = render(<ScanResults />)
    expect(container.innerHTML).toBe('')
  })
})
