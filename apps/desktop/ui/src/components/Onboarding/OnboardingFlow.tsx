import { useOnboardingStore } from '../../stores/onboardingStore'
import { LoginStep } from './LoginStep'
import { ScanStep } from './ScanStep'
import { ScanResults } from './ScanResults'
import { CompletionStep } from './CompletionStep'
import uiBg from '../../assets/ui-bg.png'

export function OnboardingFlow() {
  const currentStep = useOnboardingStore((s) => s.currentStep)

  return (
    <div
      className="relative flex flex-col items-center justify-center w-full h-full select-none overflow-hidden"
      style={{
        backgroundImage: `url(${uiBg})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {currentStep === 'auth' && <LoginStep />}
      {currentStep === 'scan' && <ScanStep />}
      {currentStep === 'scan-results' && <ScanResults />}
      {currentStep === 'complete' && <CompletionStep />}
    </div>
  )
}
