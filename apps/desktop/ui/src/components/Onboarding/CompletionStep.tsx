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
      <h1 className="font-semibold text-4xl text-plugin-accent mb-2 tracking-wider animate-scale-in">
        PROCHAIN
      </h1>
      <p className="text-plugin-muted text-xs  uppercase tracking-widest animate-fade-in-up">
        Welcome to your signal chain
      </p>
    </div>
  )
}
