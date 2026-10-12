import { useEffect } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { ProChainMark } from '../Brand/ProChainMark'

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
      <div className="animate-scale-in">
        <ProChainMark size={44} showWord={false} />
      </div>
      <h1 className="mt-4 text-4xl font-semibold text-plugin-text tracking-tight animate-scale-in">ProChain</h1>
      <p className="mt-1.5 text-plugin-muted text-sm animate-fade-in-up">Welcome to your signal chain</p>
    </div>
  )
}
