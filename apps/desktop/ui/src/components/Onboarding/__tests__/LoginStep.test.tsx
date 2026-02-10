import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginStep } from '../LoginStep'
import { useOnboardingStore } from '../../../stores/onboardingStore'

describe('LoginStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding()
  })

  it('renders email and password fields', () => {
    render(<LoginStep />)
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('does not show name field in login mode', () => {
    render(<LoginStep />)
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument()
  })

  it('shows name field in register mode', () => {
    useOnboardingStore.getState().setAuthMode('register')
    render(<LoginStep />)
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument()
  })

  it('renders Propane branding', () => {
    render(<LoginStep />)
    expect(screen.getByText('PROPANE')).toBeInTheDocument()
  })

  it('disables submit when fields are empty', () => {
    render(<LoginStep />)
    const submitBtn = screen.getByRole('button', { name: /sign in/i })
    expect(submitBtn).toBeDisabled()
  })

  it('shows error when authError is set', () => {
    useOnboardingStore.setState({ authError: 'Invalid credentials' })
    render(<LoginStep />)
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useOnboardingStore.setState({ authLoading: true })
    render(<LoginStep />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('calls submitAuth on form submission', async () => {
    const user = userEvent.setup()
    const submitAuthSpy = vi.fn().mockResolvedValue(true)
    useOnboardingStore.setState({ submitAuth: submitAuthSpy })

    render(<LoginStep />)

    await user.type(screen.getByPlaceholderText('Email'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(submitAuthSpy).toHaveBeenCalledWith('test@test.com', 'password123', undefined)
  })

  it('switches between login and register tabs', async () => {
    const user = userEvent.setup()
    render(<LoginStep />)

    await user.click(screen.getByRole('button', { name: /register/i }))
    expect(useOnboardingStore.getState().authMode).toBe('register')

    await user.click(screen.getByRole('button', { name: /login/i }))
    expect(useOnboardingStore.getState().authMode).toBe('login')
  })
})
