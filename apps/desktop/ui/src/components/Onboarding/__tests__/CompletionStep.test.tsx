import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionStep } from '../CompletionStep'
import { useOnboardingStore } from '../../../stores/onboardingStore'

describe('CompletionStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows welcome message', () => {
    render(<CompletionStep />)
    expect(screen.getByText('PROPANE')).toBeInTheDocument()
    expect(screen.getByText('Welcome to your signal chain')).toBeInTheDocument()
  })

  it('auto-advances after 2s delay', () => {
    render(<CompletionStep />)

    expect(useOnboardingStore.getState().isOnboardingComplete).toBe(false)

    vi.advanceTimersByTime(2000)

    expect(useOnboardingStore.getState().isOnboardingComplete).toBe(true)
  })

  it('completes on click', async () => {
    vi.useRealTimers() // need real timers for userEvent
    const user = userEvent.setup()

    render(<CompletionStep />)
    await user.click(screen.getByText('PROPANE'))

    expect(useOnboardingStore.getState().isOnboardingComplete).toBe(true)
  })
})
