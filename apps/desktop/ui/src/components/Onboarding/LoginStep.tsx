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

  const inputClass =
    'w-full h-10 px-3 bg-plugin-bg border border-plugin-border rounded-md text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors'

  return (
    <div className="flex flex-col w-full max-w-[360px] px-6 animate-fade-in">
      <h1 className="text-2xl font-semibold text-plugin-text tracking-tight">ProChain</h1>
      <p className="text-plugin-muted text-[13px] mt-1 mb-6">
        {authMode === 'login'
          ? 'Log in to sync your plugins and use the chain library.'
          : 'Create a free account to share chains and follow creators.'}
      </p>

      <div className="flex w-full mb-5 rounded-md bg-plugin-surface border border-plugin-border p-0.5" role="group" aria-label="Login or register">
        <button
          type="button"
          aria-pressed={authMode === 'login'}
          onClick={() => setAuthMode('login')}
          className={`flex-1 h-8 text-[13px] font-semibold rounded transition-colors ${
            authMode === 'login' ? 'bg-plugin-raised text-plugin-text' : 'text-plugin-muted hover:text-plugin-text'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          aria-pressed={authMode === 'register'}
          onClick={() => setAuthMode('register')}
          className={`flex-1 h-8 text-[13px] font-semibold rounded transition-colors ${
            authMode === 'register' ? 'bg-plugin-raised text-plugin-text' : 'text-plugin-muted hover:text-plugin-text'
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col w-full gap-2.5">
        {authMode === 'register' && (
          <input
            type="text"
            placeholder="Name"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoComplete="name"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
        />

        {authError && (
          <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2" role="alert">
            {authError}
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled || authLoading}
          className="w-full h-10 mt-1 bg-plugin-accent hover:bg-plugin-accent-bright text-plugin-on-accent text-sm font-semibold rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
