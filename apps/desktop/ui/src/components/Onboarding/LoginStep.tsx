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
      <h1 className="font-brand text-3xl text-plugin-accent crt-text mb-1 tracking-wider">
        PROPANE
      </h1>
      <p className="text-plugin-dim text-xxs font-mono uppercase tracking-widest mb-8">
        Plugin Chain Manager
      </p>

      {/* Auth mode tabs */}
      <div className="flex w-full mb-6 border border-plugin-border rounded-propane overflow-hidden">
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
            authMode === 'login'
              ? 'bg-plugin-accent text-black'
              : 'bg-black/40 text-plugin-muted hover:text-plugin-text'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
            authMode === 'register'
              ? 'bg-plugin-accent text-black'
              : 'bg-black/40 text-plugin-muted hover:text-plugin-text'
          }`}
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
            className="w-full px-3 py-2.5 bg-black/40 border border-plugin-border rounded-propane font-mono text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
            autoComplete="name"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 bg-black/40 border border-plugin-border rounded-propane font-mono text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 bg-black/40 border border-plugin-border rounded-propane font-mono text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
        />

        {authError && (
          <div className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-propane px-3 py-2">
            {authError}
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled || authLoading}
          className="w-full py-2.5 mt-1 bg-plugin-accent hover:bg-plugin-accent-bright text-black font-mono text-sm uppercase tracking-wider rounded-propane transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
