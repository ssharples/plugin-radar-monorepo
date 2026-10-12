import {
  Plugs,
  GitFork,
  Gauge,
  Waveform,
  WaveSquare,
  Timer,
  ShareNetwork,
  ArrowsLeftRight,
  Check,
  X as XIcon,
  Minus,
  DownloadSimple,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatedHeroContent } from "@/components/AnimatedHeroContent";
import { InteractiveHeroBackground } from "@/components/InteractiveHeroBackground";
import { InteractiveFeatureShowcase } from "@/components/InteractiveFeatureShowcase";
import { LiquidMetalCard } from "@/components/LiquidMetalCard";

export default function Home() {
  return (
    <div className="relative">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />

        {/* Interactive WebGL Background */}
        <InteractiveHeroBackground />

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#deff0a]/[0.03] rounded-full blur-[140px] pointer-events-none" />

        <div className="container mx-auto px-4 lg:px-6 pt-20 pb-16 relative z-10">
          <AnimatedHeroContent />

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-16">
            <StatCard value="Fast" label="Think in milliseconds" />
            <StatCard value="Ergonomic" label="Keyboard first" />
            <StatCard value="Unified" label="One view, every plugin" />
            <StatCard value="Crash-safe" label="Out-of-process scanning" />
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== FEATURE SHOWCASE ===== */}
      <InteractiveFeatureShowcase />

      <div className="section-line" />

      {/* ===== COMPARISON TABLE ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-xs text-[#deff0a] uppercase tracking-[0.2em] font-semibold mb-3">Comparison</p>
          <h2 className="text-3xl font-bold text-stone-100 mb-3">
            Built differently. Priced differently.
          </h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            The only plugin chainer built around keyboard-first workflow — no ecosystem lock-in, no subscription, full metering at every stage.
          </p>
        </div>
        <div className="max-w-4xl mx-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left py-4 px-4 text-stone-500 font-medium">#</th>
                <th className="text-left py-4 px-4 text-stone-500 font-medium">Feature</th>
                <th className="py-4 px-4 text-center bg-[#deff0a]/[0.03]">
                  <span className="text-white font-semibold">ProChain</span>
                  <span className="block text-[10px] neon-text font-bold mt-0.5"><s className="opacity-60">$60</s> $30 launch</span>
                </th>
                <th className="py-4 px-4 text-center text-stone-500 font-medium">
                  Waves StudioVerse
                  <span className="block text-[10px] text-stone-600 mt-0.5">$14.99–$24.99/mo</span>
                </th>
                <th className="py-4 px-4 text-center text-stone-500 font-medium">
                  KSHMR Chain
                  <span className="block text-[10px] text-stone-600 mt-0.5">~$49 one-time</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              <CompareRow n={1} feature="Works with ANY plugin" pro="yes" waves="no" kshmr="yes" wavesNote="Waves only" />
              <CompareRow n={2} feature="LUFS metering (ITU-R BS.1770)" pro="yes" waves="no" kshmr="no" />
              <CompareRow n={3} feature="FFT spectrum analysis" pro="yes" proNote="2048-pt" waves="no" kshmr="no" />
              <CompareRow n={4} feature="Pre/post waveform display" pro="yes" waves="no" kshmr="no" />
              <CompareRow n={5} feature="Cross-instance mirroring" pro="yes" waves="no" kshmr="no" />
              <CompareRow n={6} feature="Friends & private sharing" pro="yes" waves="no" kshmr="no" />
              <CompareRow n={7} feature="Plugin compatibility check" pro="yes" waves="na" kshmr="no" />
              <CompareRow n={8} feature="Crash-safe plugin scanning" pro="yes" proNote="Out-of-process" waves="na" kshmr="no" />
              <CompareRow n={9} feature="Per-plugin metering" pro="yes" proNote="Peak + RMS" waves="no" kshmr="partial" kshmrNote="RMS only" />
              <CompareRow n={10} feature="Dry/wet per plugin + group" pro="yes" waves="partial" wavesNote="Limited" kshmr="partial" kshmrNote="Plugin only" />
              <CompareRow n={11} feature="Auto latency compensation" pro="yes" waves="na" kshmr="no" />
              <CompareRow n={12} feature="Serial + parallel routing" pro="yes" waves="no" kshmr="yes" wavesNote="Linear only" />
              <CompareRow n={13} feature="Cross-DAW chain sharing" pro="yes" waves="yes" kshmr="no" wavesNote="Waves only" />
              <CompareRow n={14} feature="Community chain library" pro="yes" proNote="Rate, comment, fork" waves="yes" wavesNote="Waves chains" kshmr="no" />
              <CompareRow n={15} feature="DAW parameter automation" pro="yes" waves="yes" kshmr="yes" kshmrNote="Macro" />
              <CompareRow n={16} feature="Oversampling" pro="yes" proNote="Up to 4x" waves="no" kshmr="yes" kshmrNote="Up to 16x" />
              <CompareRow n={17} feature="Pricing model" pro="text" proText="$30 launch ($60 regular)" waves="text" wavesText="$15–$25/mo" kshmr="text" kshmrText="~$49 one-time" />
              <CompareRow n={18} feature="Free trial" pro="yes" waves="no" kshmr="no" />
            </tbody>
          </table>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== HOW IT WORKS ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-[#deff0a] uppercase tracking-[0.2em] font-semibold mb-3">How It Works</p>
          <h2 className="text-3xl font-bold text-stone-100">
            Your DAW just got faster.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <StepCard
            number="01"
            title="Install"
            description="Load ProChain in your DAW. A crash-safe out-of-process scanner finds every VST3, AU, and AAX plugin on your system automatically — nothing to configure."
          />
          <StepCard
            number="02"
            title="Build"
            description="Drag plugins into your chain. Keyboard shortcuts to navigate between every insert. Serial, parallel, nested routing — one view, no windows, no chaos."
          />
          <StepCard
            number="03"
            title="Flow"
            description="Mix and record without breaking concentration. Every shortcut, every meter, every routing decision in one place. Share when you've got something great."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== OPEN BETA CARD ===== */}
      <section id="pricing" className="container mx-auto px-4 lg:px-6 py-20">
        <div className="max-w-lg mx-auto">
          <LiquidMetalCard className="p-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#deff0a]/10 border border-[#deff0a]/20 text-[#deff0a] text-xs font-bold mb-6 uppercase tracking-wider">
              Launch Sale — 50% Off
            </div>

            {/* Price */}
            <div className="mb-6">
              <span className="text-2xl font-bold text-stone-500 line-through mr-3">$60</span>
              <span className="text-6xl font-extrabold neon-text">$30</span>
            </div>

            {/* Features */}
            <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
              {[
                "Every VST3, AU, and AAX plugin",
                "Keyboard-first navigation",
                "Serial & parallel routing",
                "Per-plugin metering + spectrum analysis",
                "Automatic latency compensation",
                "Chain sharing — public or private",
                "macOS and Windows",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-stone-300 text-sm">
                  <Check weight="bold" className="w-4 h-4 text-[#deff0a] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <a
              href="/pricing"
              className="neon-button w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm"
            >
              Start Free Trial
            </a>
            <p className="text-stone-500 text-xs mt-4">
              7-day free trial. Then $30 (regular $60). One-time, no subscription.
            </p>
          </LiquidMetalCard>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== DOWNLOAD CTA ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="relative rounded-2xl overflow-hidden border border-[#deff0a]/10">
          <div className="absolute inset-0 bg-gradient-to-br from-[#deff0a]/[0.03] via-transparent to-transparent" />
          <div className="relative px-8 py-14 text-center">
            <h2 className="text-3xl font-bold text-stone-100 mb-3">
              Take the short way.
            </h2>
            <p className="text-stone-400 max-w-md mx-auto mb-8">
              $30 launch price. $60 regular. No subscription.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/pricing"
                className="neon-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Start Free Trial — macOS
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                Coming Soon — Windows
              </a>
            </div>
            <p className="text-stone-600 text-xs mt-4">
              $30 launch price. No subscription required.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ===== SUB-COMPONENTS ===== */

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-card rounded-xl px-5 py-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-[#deff0a]" />
        <span className="text-2xl font-bold text-stone-100 tabular-nums">
          {value}
        </span>
      </div>
      <span className="text-xs text-stone-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card rounded-xl p-6 text-center group neon-border-hover transition-all">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-5 group-hover:bg-[#deff0a]/10 transition-colors">
        <span className="text-xl font-bold text-[#deff0a]">{number}</span>
      </div>
      <h3 className="text-lg font-semibold text-stone-100 mb-2">{title}</h3>
      <p className="text-stone-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card rounded-xl p-5 group neon-border-hover transition-all">
      <div className="text-white mb-3 group-hover:text-[#deff0a] transition-colors">
        {icon}
      </div>
      <h3 className="font-semibold text-stone-100 mb-1.5 text-sm">{title}</h3>
      <p className="text-stone-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function CompareRow({
  n,
  feature,
  pro,
  waves,
  kshmr,
  proNote,
  proText,
  wavesNote,
  wavesText,
  kshmrNote,
  kshmrText,
}: {
  n: number;
  feature: string;
  pro: "yes" | "no" | "partial" | "na" | "text";
  waves: "yes" | "no" | "partial" | "na" | "text";
  kshmr: "yes" | "no" | "partial" | "na" | "text";
  proNote?: string;
  proText?: string;
  wavesNote?: string;
  wavesText?: string;
  kshmrNote?: string;
  kshmrText?: string;
}) {
  const renderCell = (val: string, note?: string, text?: string, isProChain = false) => {
    if (val === "text") {
      return (
        <span className={`text-xs font-medium ${isProChain ? "text-[#deff0a]" : "text-stone-400"}`}>
          {text}
        </span>
      );
    }
    if (val === "yes") {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Check weight="bold" className={`w-5 h-5 mx-auto ${isProChain ? "text-[#deff0a]" : "text-white"}`} />
          {note && <span className={`text-[10px] ${isProChain ? "text-[#deff0a]/70" : "text-stone-500"}`}>{note}</span>}
        </div>
      );
    }
    if (val === "partial") {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Minus weight="bold" className="w-4 h-4 text-stone-500 mx-auto" />
          {note && <span className="text-[10px] text-stone-600">{note}</span>}
        </div>
      );
    }
    if (val === "na") {
      return <span className="text-[10px] text-stone-600">N/A</span>;
    }
    return (
      <div className="flex flex-col items-center gap-0.5">
        <XIcon weight="bold" className="w-4 h-4 text-stone-700 mx-auto" />
        {note && <span className="text-[10px] text-stone-600">{note}</span>}
      </div>
    );
  };

  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-4 text-stone-600 text-xs tabular-nums">{n}</td>
      <td className="py-3 px-4 text-stone-300">{feature}</td>
      <td className="py-3 px-4 text-center bg-[#deff0a]/[0.03]">
        {renderCell(pro, proNote, proText, true)}
      </td>
      <td className="py-3 px-4 text-center">{renderCell(waves, wavesNote, wavesText)}</td>
      <td className="py-3 px-4 text-center">{renderCell(kshmr, kshmrNote, kshmrText)}</td>
    </tr>
  );
}
