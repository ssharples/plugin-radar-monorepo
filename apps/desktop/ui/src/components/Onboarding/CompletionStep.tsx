import { useEffect } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'

export function CompletionStep() {
  const { completeOnboarding } = useOnboardingStore()

  useEffect(() => {
    const timer = setTimeout(() => {
      completeOnboarding()
    }, 2000)

    return () => clearTimeout(timer)
  }, [completeOnboarding])

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full animate-fade-in cursor-pointer"
      onClick={completeOnboarding}
    >
      <h1
        className="font-brand crt-text mb-2 animate-scale-in"
        style={{ fontSize: '2.25rem', color: 'var(--color-accent-cyan)', letterSpacing: 'var(--tracking-wider)' }}
      >
        PROPANE
      </h1>
      <p
        className="animate-fade-in-up"
        style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-widest)' }}
      >
        Welcome to your signal chain
      </p>
    </div>
  )
}
