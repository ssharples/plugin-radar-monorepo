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
      {/* ProChain brand */}
      <h1 className="font-semibold text-3xl text-plugin-accent mb-1 tracking-wider">
        PROCHAIN
      </h1>
      <p className="text-plugin-dim text-xxs  uppercase tracking-widest mb-8">
        Plugin chains for any brand
      </p>

      {/* Auth mode tabs */}
      <div className="flex w-full mb-6 border border-plugin-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className={`flex-1 py-2 text-xs  uppercase tracking-wider transition-colors ${
            authMode === 'login'
              ? 'bg-plugin-accent text-plugin-on-accent'
              : 'bg-black/40 text-plugin-muted hover:text-plugin-text'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className={`flex-1 py-2 text-xs  uppercase tracking-wider transition-colors ${
            authMode === 'register'
              ? 'bg-plugin-accent text-plugin-on-accent'
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
            className="w-full px-3 py-2.5 bg-plugin-bg border border-plugin-border rounded-md  text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
            autoComplete="name"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 bg-plugin-bg border border-plugin-border rounded-md  text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 bg-plugin-bg border border-plugin-border rounded-md  text-sm text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent transition-colors"
          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
        />

        {authError && (
          <div className="text-red-400 text-xs  bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {authError}
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled || authLoading}
          className="w-full py-2.5 mt-1 bg-plugin-accent hover:bg-plugin-accent-bright text-plugin-on-accent  text-sm uppercase tracking-wider rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
