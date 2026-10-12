import { Layers, Globe2, Repeat2, Check } from 'lucide-react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { LoginStep } from './LoginStep'
import { ScanStep } from './ScanStep'
import { ScanResults } from './ScanResults'
import { CompletionStep } from './CompletionStep'
import { ProChainMark } from '../Brand/ProChainMark'

const STEPS = [
  { id: 'auth', label: 'Account' },
  { id: 'scan', label: 'Scan plugins' },
  { id: 'complete', label: 'Start' },
] as const

function stepIndex(step: string) {
  if (step === 'auth') return 0
  if (step === 'scan' || step === 'scan-results') return 1
  return 2
}

const POINTS = [
  { icon: Layers, title: 'Any brand, one chain', body: 'Mix plugins from every maker in serial and parallel groups.' },
  { icon: Globe2, title: 'A shared library', body: 'Load chains other producers share, and share your own.' },
  { icon: Repeat2, title: 'Missing a plugin?', body: 'See what you own, swap in a close match, or find where to buy it.' },
]

export function OnboardingFlow() {
  const currentStep = useOnboardingStore((s) => s.currentStep)

  if (currentStep === 'complete') {
    return (
      <div className="relative flex w-full h-full select-none overflow-hidden bg-plugin-bg canvas-grid">
        <CompletionStep />
      </div>
    )
  }

  const active = stepIndex(currentStep)

  return (
    <div className="relative flex w-full h-full select-none overflow-hidden bg-plugin-bg">
      {/* Brand panel */}
      <aside className="hidden md:flex flex-col w-[38%] max-w-[440px] min-w-[300px] border-r border-plugin-border bg-plugin-surface canvas-grid px-8 py-8">
        <ProChainMark size={28} showWord={false} />
        <h2 className="mt-6 text-[26px] leading-[1.1] font-semibold text-plugin-text tracking-tight">
          Build a chain from
          <br />
          <span className="text-plugin-accent-bright">every plugin you own.</span>
        </h2>
        <ul className="mt-7 space-y-4">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 w-7 h-7 flex-shrink-0 rounded-md bg-plugin-accent/12 border border-plugin-accent/25 text-plugin-accent-bright inline-flex items-center justify-center">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-plugin-text">{title}</span>
                <span className="block text-xs text-plugin-muted leading-snug mt-0.5">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        {/* Miniature chain */}
        <div className="rounded-lg border border-plugin-border bg-plugin-bg/80 p-2 space-y-1" aria-hidden>
          {[
            ['EQ', 'bg-blue-400', 'Pro-Q 3', 'FabFilter'],
            ['CMP', 'bg-orange-400', '1176 Rev A', 'UAD'],
            ['VRB', 'bg-purple-400', 'Valhalla Room', 'Valhalla DSP'],
          ].map(([tag, sw, name, maker]) => (
            <div key={name} className="flex items-center gap-2 h-8 px-2 rounded-md bg-plugin-surface-alt border border-plugin-border">
              <span className={`w-[3px] h-5 rounded-full ${sw}`} />
              <span className="text-[12px] font-semibold text-plugin-text">{name}</span>
              <span className="text-[11px] text-plugin-dim">{maker}</span>
              <span className="flex-1" />
              <span className="text-[10px] font-semibold text-plugin-dim tracking-wider">{tag}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Step panel */}
      <main className="flex-1 flex flex-col min-w-0">
        <ol className="flex items-center gap-2 h-12 px-6 border-b border-plugin-border flex-shrink-0" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              {i > 0 && <span className="w-6 h-px bg-plugin-border-bright" aria-hidden />}
              <span
                className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-semibold border ${
                  i < active
                    ? 'bg-plugin-accent border-plugin-accent text-plugin-on-accent'
                    : i === active
                      ? 'border-plugin-accent text-plugin-accent-bright'
                      : 'border-plugin-border-bright text-plugin-dim'
                }`}
              >
                {i < active ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className={`text-xs font-medium ${i === active ? 'text-plugin-text' : 'text-plugin-dim'}`} aria-current={i === active ? 'step' : undefined}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-6">
          {currentStep === 'auth' && <LoginStep />}
          {currentStep === 'scan' && <ScanStep />}
          {currentStep === 'scan-results' && <ScanResults />}
        </div>
      </main>
    </div>
  )
}
