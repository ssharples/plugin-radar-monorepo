import { useState, useCallback } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'

export function LoginStep() {
  const { authMode, authLoading, authError, setAuthMode, submitAuth } = useOnboardingStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      await submitAuth(email, password, authMode === 'register' ? name : undefined)
    },
    [email, password, name, authMode, submitAuth]
  )

  const isDisabled = !email.trim() || !password.trim() || (authMode === 'register' && !name.trim())

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm px-6 animate-fade-in">
      {/* Propane brand */}
      <h1
        className="font-brand crt-text mb-1"
        style={{ fontSize: '1.875rem', color: 'var(--color-accent-cyan)', letterSpacing: 'var(--tracking-wider)' }}
      >
        PROPANE
      </h1>
      <p style={{ color: 'var(--color-text-disabled)', fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-widest)', marginBottom: '2rem' }}>
        Plugin Chain Manager
      </p>

      {/* Auth mode tabs */}
      <div className="flex w-full mb-6" style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className="flex-1 fast-snap"
          style={{
            padding: '8px 0',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            border: 'none',
            cursor: 'pointer',
            background: authMode === 'login' ? 'var(--color-accent-cyan)' : 'rgba(0, 0, 0, 0.4)',
            color: authMode === 'login' ? 'black' : 'var(--color-text-disabled)',
            transition: 'all var(--duration-fast)',
          }}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className="flex-1 fast-snap"
          style={{
            padding: '8px 0',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            border: 'none',
            cursor: 'pointer',
            background: authMode === 'register' ? 'var(--color-accent-cyan)' : 'rgba(0, 0, 0, 0.4)',
            color: authMode === 'register' ? 'black' : 'var(--color-text-disabled)',
            transition: 'all var(--duration-fast)',
          }}
        >
          Register
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col w-full gap-3">
        {authMode === 'register' && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input w-full"
            autoComplete="name"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input w-full"
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input w-full"
          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
        />

        {authError && (
          <div style={{ color: 'var(--color-status-error)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.2)', borderRadius: 'var(--radius-base)', padding: '8px 12px' }}>
            {authError}
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled || authLoading}
          className="btn btn-primary w-full"
          style={{ marginTop: '4px', opacity: isDisabled || authLoading ? 0.4 : 1, cursor: isDisabled || authLoading ? 'not-allowed' : 'pointer' }}
        >
          {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
