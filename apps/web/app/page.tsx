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

export default function Home() {
  return (
    <div className="relative">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#deff0a]/[0.03] rounded-full blur-[140px]" />

        <div className="container mx-auto px-4 lg:px-6 pt-20 pb-16 relative">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-emerald-500/30 text-white text-xs font-medium mb-6">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              Open Beta
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
              <span className="text-stone-100">Build it. Share it.</span>
              <br />
              <span className="text-white">Fork it.</span>
            </h1>
            <p className="text-lg text-stone-400 max-w-xl leading-relaxed mb-8">
              Chain your plugins, share your vocal chains, and discover what
              top producers are actually using. The GitHub for plugin chains
              — built for hip-hop, pop, and EDM producers.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/download"
                className="neon-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download Free — Open Beta
              </a>
              <a
                href="/chains"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                Browse Chains
              </a>
            </div>
            <p className="text-stone-600 text-xs mt-4">
              Free during open beta. macOS &amp; Windows. No account required.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-16">
            <StatCard value="Any Plugin" label="VST3 / AU / AAX" />
            <StatCard value="Cross-DAW" label="Share Anywhere" />
            <StatCard value="100% Free" label="Open Beta" />
            <StatCard value="Community Chains" label="Rate, Fork, Share" />
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== FEATURE SHOWCASE ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-[#deff0a] uppercase tracking-[0.2em] font-semibold mb-3">Features</p>
          <h2 className="text-3xl font-bold text-stone-100">
            Everything missing from your DAW&apos;s channel strip
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          <FeatureCard
            icon={<Plugs weight="duotone" className="w-6 h-6" />}
            title="Any Plugin, Any DAW"
            description="Use every VST3, AU, and AAX plugin you own. No ecosystem lock-in, no vendor restrictions."
          />
          <FeatureCard
            icon={<GitFork weight="duotone" className="w-6 h-6" />}
            title="Visual Signal Flow"
            description="See your entire signal path at a glance. Drag-and-drop serial chains, parallel groups, and nested routing."
          />
          <FeatureCard
            icon={<Gauge weight="duotone" className="w-6 h-6" />}
            title="Per-Plugin Metering"
            description="Peak and RMS levels after every insert. Find gain staging problems before they reach your mix bus."
          />
          <FeatureCard
            icon={<Waveform weight="duotone" className="w-6 h-6" />}
            title="LUFS Monitoring"
            description="Broadcast-standard loudness metering (ITU-R BS.1770-4) built right into your chain."
          />
          <FeatureCard
            icon={<WaveSquare weight="duotone" className="w-6 h-6" />}
            title="Spectrum Analysis"
            description="Real-time FFT at every stage. See exactly what each plugin is doing to your frequency balance."
          />
          <FeatureCard
            icon={<Timer weight="duotone" className="w-6 h-6" />}
            title="Auto Latency Comp"
            description="Parallel branches stay phase-aligned automatically. No more manual delay compensation."
          />
          <FeatureCard
            icon={<ShareNetwork weight="duotone" className="w-6 h-6" />}
            title="Community Sharing"
            description="Publish chains for others to rate, comment on, and fork. Discover what producers in your genre are using."
          />
          <FeatureCard
            icon={<ArrowsLeftRight weight="duotone" className="w-6 h-6" />}
            title="Cross-Instance Mirror"
            description="Mirror chains across multiple DAW tracks. Change one instance, all others follow in real-time."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== COMPARISON TABLE ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-xs text-[#deff0a] uppercase tracking-[0.2em] font-semibold mb-3">Comparison</p>
          <h2 className="text-3xl font-bold text-stone-100 mb-3">
            How ProChain stacks up
          </h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            The only plugin chainer with no ecosystem lock-in, no subscription, and full metering at every stage.
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
                  <span className="block text-[10px] neon-text font-bold mt-0.5">Free (Open Beta)</span>
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
              <CompareRow n={17} feature="Pricing model" pro="text" proText="Free (Open Beta)" waves="text" wavesText="$15–$25/mo" kshmr="text" kshmrText="~$49 one-time" />
              <CompareRow n={18} feature="Free trial" pro="text" proText="Full product, free" waves="no" kshmr="no" />
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
            Up and running in minutes
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <StepCard
            number="01"
            title="Install"
            description="Download ProChain and load it in your DAW. A crash-safe scanner finds every VST3, AU, and AAX plugin on your system automatically."
          />
          <StepCard
            number="02"
            title="Build"
            description="Drag plugins into serial chains or parallel groups. See metering after every insert. Adjust dry/wet, gain, and routing visually."
          />
          <StepCard
            number="03"
            title="Share"
            description="Publish your chains for the community to rate, comment on, and fork — like GitHub for signal chains. Send chains privately to friends, or browse what other producers are using."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== OPEN BETA CARD ===== */}
      <section id="pricing" className="container mx-auto px-4 lg:px-6 py-20">
        <div className="max-w-lg mx-auto">
          <div className="glass-card-strong rounded-2xl p-8 text-center border border-[#deff0a]/20 animate-neon-pulse">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#deff0a]/10 border border-[#deff0a]/20 text-[#deff0a] text-xs font-bold mb-6 uppercase tracking-wider">
              Open Beta — Free
            </div>

            {/* Price */}
            <div className="mb-6">
              <span className="text-6xl font-extrabold neon-text">Free</span>
            </div>

            {/* Features */}
            <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
              {[
                "Every VST3, AU, and AAX plugin",
                "Unlimited chains and presets",
                "Per-plugin metering and spectrum analysis",
                "Cloud sharing with compatibility check",
                "Cross-instance mirroring",
                "Community chains — rate, fork, share",
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
              href="/download"
              className="neon-button w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm"
            >
              <DownloadSimple weight="bold" className="w-4 h-4" />
              Download ProChain Free
            </a>
            <p className="text-stone-500 text-xs mt-4">
              No credit card. No account required. Free during open beta.
            </p>
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== DOWNLOAD CTA ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="relative rounded-2xl overflow-hidden border border-[#deff0a]/10">
          <div className="absolute inset-0 bg-gradient-to-br from-[#deff0a]/[0.03] via-transparent to-transparent" />
          <div className="relative px-8 py-14 text-center">
            <h2 className="text-3xl font-bold text-stone-100 mb-3">
              Start building better signal chains today
            </h2>
            <p className="text-stone-400 max-w-md mx-auto mb-8">
              Completely free during open beta. Works with every major DAW on macOS and Windows.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/download?platform=mac"
                className="neon-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download for macOS
              </a>
              <a
                href="/download?platform=windows"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download for Windows
              </a>
            </div>
            <p className="text-stone-600 text-xs mt-4">
              VST3 / AU / AAX — Free during open beta. No account required.
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
