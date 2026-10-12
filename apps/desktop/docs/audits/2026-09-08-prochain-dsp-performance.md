# ProChain DSP performance audit — 8 September 2026

ProChain has a large, demonstrated opportunity to improve performance. Its metering alone can currently exceed the audio deadline several times over. Fixing that is more valuable than starting with SIMD tuning or a new multicore engine. The audit also found routing and state defects that must be resolved before marketing the wrapper for demanding mix sessions.

**Scope and evidence.** Reviewed the current `apps/desktop` JUCE/C++ engine, automation, plugin lifecycle, preset handling, and relevant React/native bridge paths. The separate Studio Time Machine app and cloud product were outside this DSP audit. Production source and installed plugins were not changed. Experimental source copies, test factories and builds ran in a temporary directory. No installed third-party effects were instantiated, no plugin scan ran, and no audio project was opened. This is an implementation audit with synthetic measurements, not a native-DAW comparison or a release certification.

The machine was an Apple M2 Max with 64 GiB memory. The local JUCE dependency is **8.0.4**, matching CMake. Builds used Release / Apple Clang / `-O3`, without fast-math. HEAD was `89cbc0bd420cc75cbaf311b2f7f95e87cbfd0906`; the reviewed working tree includes existing changes. Source hashes are in [source-manifest.json](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/source-manifest.json).

**The most important measurement**

For 20 active plugins, the current graph installs two `AudioMeter` instances per plugin plus the wrapper's input and output meters: **42 full meters**. Each maintains and re-sums a three-second stereo loudness window on every callback. The inline plugin UI only consumes peak/peak-hold readings. See [ChainProcessor.cpp:924](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:924), [NodeMeterProcessor.cpp:20](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/NodeMeterProcessor.cpp:20), [AudioMeter.cpp:146](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/AudioMeter.cpp:146), and [ChainProcessor.cpp:1253](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1253).

The benchmark invokes those real meter classes sequentially on synthetic stereo buffers. It excludes hosted plugin DSP, graph overhead, UI rendering and audio-device scheduling. It uses 32 warm-up blocks and 600 timed blocks per configuration. Percentiles describe this short ordinary-process run, not a guaranteed real-time worst case.

| Equivalent workload | Audio deadline | Current meters, median | Experimental running sums, median | Current / deadline |
|---|---:|---:|---:|---:|
| Empty wrapper, 48 kHz / 64 samples: 2 meters | 1.333 ms | 0.260 ms | 0.00358 ms | 19.5% |
| 20 plugins, 48 kHz / 64: 42 meters | 1.333 ms | **5.466 ms** | **0.0750 ms** | **410.0%** |
| 20 plugins, 48 kHz / 256: 42 meters | 5.333 ms | 5.680 ms | 0.379 ms | 106.5% |
| 20 plugins, 48 kHz / 512: 42 meters | 10.667 ms | 6.074 ms | 0.749 ms | 56.9% |
| 40 plugins, 48 kHz / 64: 82 meters | 1.333 ms | 10.499 ms | 0.146 ms | 787.4% |
| 20 plugins, 96 kHz / 64: 42 meters | 0.667 ms | 10.637 ms | 0.0749 ms | 1595.5% |

At 48 kHz / 64 / 42 meters, p99 was 5.824 ms currently and 0.101 ms for the running-sum experiment. The median improvement was **72.8× for this meter workload**. This does not accelerate a vendor's EQ or compressor by that factor. It removes work added by the wrapper.

An additional experiment retaining peak/RMS processing but removing loudness calculation took 0.00275 ms for 42 meters at 48 kHz / 64. That is evidence for separating inline peak meters from full loudness meters. It is not a complete replacement meter implementation. The experimental classes were not integrated into ProChain, and they deliberately retain existing meter calibration to isolate performance.

Raw results: [meter-results.csv](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/meter-results.csv). Harness: [meter_bench.cpp](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/meter_bench.cpp). Numerical comparison: [meter-correctness.txt](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/meter-correctness.txt).

**Why this cost explodes**

Let `N` be plugin count, `M = 2N + 2` meters, `Fs` sample rate, `B` block size, and `W = 3Fs` samples per channel in the loudness window.

The full-window summation performs approximately:

```
window additions per second = M × 2W × Fs/B
                            = 6M × Fs²/B
```

For 20 plugins at 48 kHz / 64: `42 × 288,000 × 750 = 9.072 billion` float accumulations per second, before filters and effect processing. It logically reads about 36.3 GB/s of window values, though cache behavior determines actual DRAM traffic. The ring buffers alone occupy about 46.1 MiB per wrapper. At 96 kHz, the window doubles and callbacks per second double, so this summation work per second quadruples.

The same sliding-window sum can instead be maintained by:

```
Snew = Sold + newSquaredSample - expiringSquaredSample
```

This changes the window maintenance from `O(M × Fs²/B)` per second to `O(M × Fs)`. At 48 kHz / 64, the old summation visits 2,250 times as much window history as the arriving sample count; this is an operation-count comparison, not a predicted overall speedup. Use double-precision accumulators, explicit reset, and bounded drift correction. Publish logarithmic readings at display cadence. A five-second synthetic comparison of the experimental recurrence against the original returned a maximum difference of approximately **0.000048 dB**. Long-duration numerical validation remains necessary.

**Prioritised findings and remedies**

Priority 1 means address before the proposed professional launch. Priority 2 means an important optimisation or capability decision. Effort estimates below describe scope, not promised delivery dates.

**1. Priority 1 — Full loudness meters dominate the callback. Measured. Scope: small to medium.**

Implement running sums; give inline meters a peak/peak-hold-only path; reserve full loudness for locations where it is actually used. Adjacent serial boundaries can share a measurement when they observe exactly the same signal, reducing duplicate input/output scans. Avoid allocating a three-second history for every small peak meter.

The outer callback always computes input/output meters, waveform and FFT, even with the editor closed: [PluginProcessor.cpp:150](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/PluginProcessor.cpp:150). The UI timer being stopped does not stop audio-side analysis. Use an explicit analysis subscription/quality state. Keep measurements required by audio features active independently of editor visibility. This should be the first performance implementation, with the same benchmark repeated against production code.

**2. Priority 1 — Unequal-latency parallel processing drops the shorter branch. Reproduced. Scope: small correction plus graph tests.**

[LatencyCompensationProcessor.cpp:3](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/LatencyCompensationProcessor.cpp:3) uses JUCE's default `AudioProcessor` constructor, which declares stereo buses **disabled**. The processor therefore reports **zero input and zero output channels**. Yet [ChainProcessor.cpp:1172](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1172) attempts stereo connections into and out of it and ignores connection failures.

A unit impulse through two unity branches, one reporting/producing 64 samples of delay, should recombine at sample 64 with amplitude 1 under the current averaging law. The actual chain returned **0.5**. The short branch was absent. An isolated experimental constructor enabling both stereo buses changed the result to **1.0**, with the same latency.

Enable valid buses or remove the redundant manual delay processors and rely on a verified JUCE PDC path. Check every connection result during graph compilation and reject an invalid candidate graph. Existing delay tests pass because they give the processor a stereo buffer directly; they do not test graph bus legality. Evidence: [graph-results.txt](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/graph-results.txt), [graph-results-enabled-delay.txt](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/graph-results-enabled-delay.txt).

**3. Priority 1 — Bypass and branch exclusion do not guarantee saved DSP. Reproduced for bypass. Scope: medium.**

[ChainProcessor.cpp:913](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:913) skips connections to bypassed plugins, but keeps their nodes in `AudioProcessorGraph`. JUCE 8.0.4 creates rendering operations for all graph nodes, including disconnected ones. The counting probe returned one hosted `processBlock` call for one bypassed audio block, while audio correctly passed around it. Similar retained nodes occur for excluded parallel branches.

Define separate semantics for temporary audible bypass and CPU suspension. A compiled active-node set or a verified bypass adapter can avoid calling expensive plugin DSP while retaining state. JUCE node bypass alone is not a universal zero-DSP promise: plugins with their own bypass parameters can still implement their own processing. Preserve latency, ramp transitions, and decide whether tails are drained or cut before suspending. Removing graph connections alone is insufficient.

**4. Priority 1 — A fresh group's dry/wet control does not affect audio. Reproduced. Scope: small.**

Groups start at 100% wet. [ChainProcessor.cpp:985](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:985) omits the mixer at that setting. [ChainProcessor.cpp:461](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:461) changes only an existing mixer, so the first adjustment does not create one. With a gain-of-two effect, setting a fresh group to 0% wet still returned amplitude **2**; after an unrelated rebuild it returned **1**.

Create the mixer when its required topology changes, or retain an inexpensive mixer with endpoint fast paths. Reset stale utility-node IDs on rebuild. Test the first edit, both endpoints, repeated graph edits and sample smoothing. The parallel-group implementation also never reads its stored dry/wet value; define and implement that behavior if its control is exposed.

**5. Priority 1 — The wrapper does not forward essential host context. Static evidence. Scope: medium.**

The outer processor calls the nested graph at [PluginProcessor.cpp:158](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/PluginProcessor.cpp:158) without giving it the host playhead. JUCE forwards the graph's own playhead to each child, so tempo, transport and position can be unavailable to hosted delay/modulation plugins. The wrapper also does not forward offline mode or override reset propagation, and always reports a **zero tail** at [PluginProcessor.cpp:69](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/PluginProcessor.cpp:69). JUCE 8.0.4 exposes an audio-workgroup context hook; the wrapper does not relay it to hosted processors that might use auxiliary real-time threads.

Forward playhead at the appropriate callback boundary; propagate non-realtime mode, reset and workgroup changes through the hosting layer according to JUCE/format contracts. Cache a conservative graph-aware tail result, including unbounded tails. Test stop/start, seeks, looping, tempo automation, offline bounce and DAW tail handling. The current public bus layout is stereo-only; negotiate supported hosted layouts and report unsupported configurations rather than silently ignoring failed channel connections.

**6. Priority 1 — Host latency can disagree with the audio graph. Reproduced for mute; dynamic changes need testing. Scope: medium.**

[ChainProcessor.cpp:1203](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1203) computes latency from the logical tree. Its parallel calculation includes muted/non-soloed branches, while wiring excludes them. Muting the 64-sample branch in the probe yielded **tree latency 64, graph latency 0, output impulse at sample 0**. The outer processor reports the tree value through [PluginProcessor.cpp:16](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/PluginProcessor.cpp:16). That can shift this track relative to the rest of the DAW mix.

`onLatencyChanged` is emitted only from chain-change notifications ([ChainProcessor.cpp:2036](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:2036)). No hosted-processor latency listener is registered, and direct state application at [ChainProcessor.cpp:1949](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1949) does not refresh this contract. A native plugin preset or oversampling change can alter latency without a wrapper topology change.

Choose whether bypass/mute maintains stable latency or intentionally changes it. Make the compiled audible graph, compensation delays and host report agree. Observe child latency changes, coalesce rebuild/host notifications, and prevent stale queued values from winning. Verify both physical impulse timing and reported latency; neither alone proves PDC correctness.

JUCE already aligns inputs to a destination, including the dry and wet inputs of a mixer. The serial dry/wet impulse probe returned one aligned unit peak at sample 64. The audit does **not** support adding another unconditional dry delay or claiming manual compensation is inherently double-counted.

**7. Priority 1 — Automation is limited to 16 plugins and tied to changing positions. Static evidence, plus lifecycle probe. Scope: medium to large.**

[ParameterProxyPool.h:11](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/automation/ParameterProxyPool.h:11) reserves 16 × 128 = **2,048** proxy parameters. Plugins 17 onward have no proxies. Reordering/inserting/removing changes the DFS slot-to-plugin mapping at [ParameterProxyPool.cpp:46](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/automation/ParameterProxyPool.cpp:46), so a DAW lane can target a different plugin after an edit. Increasing the slot count alone does not fix identity.

Each edit unbinds the whole pool, including unused slots; `bind()` unbinds again. Every unbind sends zero to listeners. At least 40,960 unbind notifications occur across 20 edits before counting the extra binds. Use a persistent assignment from wrapper parameter ID to stable plugin-node/parameter identity, stored with the session. Diff changed bindings and avoid unsolicited value resets to unchanged slots. Preserve existing parameter IDs for session compatibility.

There is also a lifetime hazard. Proxies hold atomic **raw pointers**, and [ProxyParameter.cpp:39](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/automation/ProxyParameter.cpp:39) dereferences the old pointer while unbinding. [ChainProcessor.cpp:186](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:186) removes plugin nodes before the rebinding callback. The synthetic remove-before-render probe showed the processor already destroyed when that callback runs. Active render sequences sometimes retain old nodes; that is not a lifetime guarantee for all host states. The outer processor also destroys its chain member before its base-owned proxy parameters, without explicit early unbinding. Unbind while targets are alive, retain objects through in-flight reads and detach editors before processor destruction. Use ASan/TSan and automated close/remove/restore stress tests to prove the fix.

**8. Priority 1 — The main plugin manager does not register VST3 hosting. Static evidence. Scope: small plus compatibility validation.**

[PluginManager.cpp:5](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/PluginManager.cpp:5) registers only `AudioUnitPluginFormat`. The scanner helper registers VST3 too, and CMake defines VST3 hosting, but that does not populate the main format manager. Consequently a VST3 description reaching `createPluginInstance` has no matching host format. The wrapper being built *as* VST3 is separate from its ability to host VST3 effects.

Register the intended formats in the actual host manager and verify each format with real effects after the synthetic suite passes. Keep architecture, plugin identifier, format and version in cache/preset compatibility keys. Opaque AU and VST3 state blobs are not guaranteed interchangeable merely because both use JUCE's `MemoryBlock` API.

**9. Priority 1 — Preset changes destroy/recreate live chains without a validated replacement. Static evidence. Scope: medium to large.**

The bridge loads presets synchronously on its native/message-thread path. [PresetManager.cpp:186](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/PresetManager.cpp:186) serializes the old chain as a rollback snapshot; [ChainProcessor.cpp:1731](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1731) then clears it and constructs/restores each replacement plugin. Each per-node `addNode`/`removeNode` uses synchronous default updates outside the otherwise-batched final rebuild. When plugins are missing, restore records their names but still returns `success=true`, so the rollback path is not entered. Direct plugin state application can also run against an instance being processed, without a defined handoff protocol.

Introduce a transaction with explicit states: requested → loading → validated → committed, or failed with the current chain preserved. Parse files and cached metadata away from real-time work. Use JUCE's asynchronous factory where applicable, respecting AU/VST3 thread requirements rather than moving arbitrary plugin calls to generic workers. Build the candidate routing once, validate its state/layout/latency, then commit at a controlled boundary. Make partial restore a deliberate, visible outcome. Retire old instances safely off the callback after readers release them.

For rapid browsing, keep only the latest requested candidate, cancel obsolete work when safe, and cap warmed instances/memory. Reuse compatible instances only when a safe state-swap protocol exists. A crossfade needs latency alignment and CPU headroom for both render paths; shared stateful plugin instances must not be processed twice. A bounded fade-out/switch/fade-in is a valid lower-cost fallback. A factory or preset owned by another vendor can still be slow; promise responsive loading/progress and measured readiness rather than universal instant instantiation.

**10. Priority 1 — Session/preset recall omits audible state. Reproduced for group branches; static evidence for outer gains. Scope: medium.**

Plugin leaves serialize branch gain/solo/mute, but group nodes do not: [ChainProcessor.cpp:1318](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1318) versus [ChainProcessor.cpp:1339](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1339), and group restore at [ChainProcessor.cpp:1399](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1399). A serial group used as a parallel branch lost its **−6 dB gain and mute flag**, returning to 0 dB/unmuted after a real chain XML round trip.

The wrapper's input/output gains live outside `ChainProcessor`, but neither [PresetManager.cpp:168](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/PresetManager.cpp:168) nor [PluginProcessor.cpp:181](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/PluginProcessor.cpp:181) saves them. A recalled mix can therefore sound different. Define a versioned state root containing all audible wrapper settings, group branch settings and stable automation assignments, with migrations and identity checks. Round-trip actual processors and listen/null-test the result, not just the XML shape.

The bridge has whole-chain preset operations and native editor access, but no common hosted-plugin program/preset enumeration API. Users can use a vendor's editor; fast integrated plugin-level preset navigation needs its own format-aware contract. Do not assume every vendor exposes its complete preset library through `getNumPrograms()`.

**11. Priority 1 — Meter calibration and automatic gain matching need correction. Code math plus RMS probe. Scope: medium.**

At [AudioMeter.cpp:173](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/AudioMeter.cpp:173), stereo power is divided by `2W`, averaging the channels. The BS.1770 channel-weighted sum for L/R uses `(SL+SR)/W`; the extra division makes the result **3.0103 dB lower** for the same stereo signal. This is separate from the performance recurrence. The standard defines channel summation and supplies reference validation material: [ITU-R BS.1770-5, Annex 1](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf).

RMS uses a per-sample smoothing coefficient once per **block**, and smooths amplitudes instead of mean-square energy: [AudioMeter.cpp:14](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/AudioMeter.cpp:14), [AudioMeter.cpp:136](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/AudioMeter.cpp:136). For constant 0.5 amplitude after roughly one second, the probe read **0.0254 at 64-sample blocks** and **0.00325 at 512**, showing strong buffer-size dependence. Smooth power with a coefficient accounting for elapsed samples, then take its square root; validate the intended time response.

Output metering happens **before output gain**. The match-lock controller at [WebViewBridge.cpp:873](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/bridge/WebViewBridge.cpp:873) repeatedly adds a correction to output gain based on that pre-gain reading. After a persistent chain level change, its error cannot see its own correction, so gain continues towards a limit instead of converging. It also runs only with the editor's streaming timer. Compute a bounded absolute target from the pre-gain measurement, or use a genuine post-gain feedback measurement; keep audio behavior in the processor independently of WebView lifetime. Validate with constant-level step signals, opening/closing the editor and preset changes. This control-loop conclusion is from code, not a live listening test.

**12. Priority 2 — Repeated graph reconstruction and discovery obstruct rapid editing. Static evidence; synthetic timings are exploratory. Scope: medium.**

[ChainProcessor.cpp:851](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:851) correctly batches connection changes with `UpdateKind::none` and performs one final render-sequence rebuild. Keep that improvement. However, each operation still removes every utility/I/O node and recreates meters, delays and gains. Adding 20 plugins separately creates `2(1+2+...+20)=420` inline meters over the operation sequence rather than 40 once, as well as repeated graph and proxy work. At 48 kHz that entails approximately 461 MiB of cumulative meter-history allocation/initialisation, excluding retained old graphs and other buffers.

Preserve unchanged utility nodes and delay histories, batch multiple additions into one graph transaction, and defer metadata/discovery not needed for audio readiness. Compile static semantic regex patterns once: [ParameterDiscovery.cpp:37](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ParameterDiscovery.cpp:37) currently constructs them for each match. Cache discovery by stable format/plugin/version/schema identity; only dispatch plugin API calls on threads the format permits. Scan progress repeatedly sends the entire known-plugin JSON list at [WebViewBridge.cpp:700](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/bridge/WebViewBridge.cpp:700); emit deltas or throttle list refreshes.

Synthetic additions show millisecond-scale bookkeeping even with trivial test effects, but single operation timings varied with scheduling. They are not vendor load-time benchmarks. Add proper timestamps for request acceptance, instance construction, state restore, prepare, graph commit, first audio and editor readiness.

**13. Priority 2 — FFT publication is not a safe reader/writer ownership protocol. Static concurrency evidence. Scope: medium.**

[FFTProcessor.cpp:64](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/FFTProcessor.cpp:64) alternates two plain float arrays using an atomic index. [FFTProcessor.cpp:89](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/FFTProcessor.cpp:89) reads one after loading that index but never reserves/releases it. If the reader is descheduled while copying and the producer publishes twice, the producer can overwrite the array being read. The atomic index does not make simultaneous non-atomic float access safe.

Use a bounded SPSC queue or a correctly owned triple-buffer/mailbox where the audio writer never waits for the UI. Move window/FFT/magnitude work to an analysis worker and publish complete frames; drop stale analysis frames when needed. Gate optional analysis by subscriptions, and send only fresh FFT frames. The current `newDataReady` flag is set but never consumed. Approximately 46,080 FFT/waveform scalar values alone are constructed for 30-Hz UI delivery per visible instance, plus meters and JSON objects; optimise that independently of DSP. Validate UI stall behavior with TSan and offline fast-render stress.

Additional edge cases: waveform capture resets accumulators inside a loop after measuring a whole block, so a block larger than 512 samples produces a real peak followed by artificial zero peaks ([WaveformCapture.cpp:46](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/audio/WaveformCapture.cpp:46)). Meter scratch handling truncates excess block samples; the gain smoother holds its last ramp value for excess samples instead of advancing through them. Process arbitrary block sizes in bounded chunks without allocations or discarding time. Test zero-length and irregular blocks too.

**14. Priority 2 — True shared sends/returns require a richer routing model. Capability gap. Scope: large.**

The current tree supports serial and parallel groups ([ChainNode.h:11](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainNode.h:11)). It does not represent several sources feeding a single reusable return bus, explicit sidechain ports, or graph edges between arbitrary nodes. Splitting one source into parallel branches already works conceptually, but it is not a complete aux-bus model.

For the requested mixing workflow, model audio ports and an acyclic routing graph with first-class send gains, return gains, pre/post-fader taps, sidechain channels and named buses. Compile a topological schedule, buffer lifetimes and PDC away from the audio callback. Reject instantaneous feedback loops; explicit feedback with at least one defined delay is a separate feature. Preserve current tree presets by translating them into the graph.

The current branch gain is **before** the effects ([ChainProcessor.cpp:1146](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1146)). Turning it changes compressor/saturator drive, which is different from changing a return fader after processing. Both controls may be useful, but should be distinct. The current sum is also divided by active branch count, so adding/removing a branch changes the level of all existing branches. A conventional aux mix is `dry + Σ returnGain_i × effect_i(sendGain_i × source)`. Choose and expose the intended gain law, preserve headroom, and avoid silently changing established presets.

Parallel MIDI currently returns only the final branch: [ChainProcessor.cpp:1155](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:1155). Two synthetic branches generating notes 60 and 72 returned only **72**. Define merge/passthrough behavior, preserve event timestamps, avoid duplicated incoming notes, and prevent stuck notes on mute or edits.

**15. Priority 2 — Native editor retention and mirror work need bounded policies. Static evidence. Scope: medium.**

The native window close button only hides its editor ([ChainProcessor.cpp:60](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/ChainProcessor.cpp:60)), whereas `hidePluginWindow` destroys it. Hidden third-party editors can retain resources or timers; their actual CPU impact depends on the vendor and was not measured. Track visible windows separately from cached editors, cap any warm-editor cache and destroy off the audio thread with processor lifetime protected.

Mirror mode polls all parameters at 15 Hz and can serialize/reimport entire chains on structural notifications ([MirrorManager.cpp:194](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/MirrorManager.cpp:194), [MirrorManager.cpp:270](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/src/core/MirrorManager.cpp:270)). Do not let a simple fader edit cause full partner instance recreation. Use stable identities, parameter deltas and batched structural transactions; profile several wrapper instances as well as one large chain.

**What mathematics allows beyond removing overhead**

For block size `B` and sample rate `Fs`, the time budget is `D = B/Fs`. The deadline includes everything the DAW must render on that dependency path, not just ProChain.

| Buffer | 48 kHz deadline | 96 kHz deadline |
|---:|---:|---:|
| 32 | 0.667 ms | 0.333 ms |
| 64 | 1.333 ms | 0.667 ms |
| 128 | 2.667 ms | 1.333 ms |
| 256 | 5.333 ms | 2.667 ms |
| 512 | 10.667 ms | 5.333 ms |

For serial processing, `T ≈ Σ pluginCost_i + wrapperCost`. Arbitrary nonlinear, stateful plugins cannot generally be fused, reordered, cached across different input, or rendered simultaneously on the same block while preserving their sound. A compressor needs the upstream EQ's output; oversampling, lookahead and internal processing cost remain the vendor's responsibility. Twenty effects costing 100 microseconds each already need 2 ms, above a 48 kHz / 64 block deadline, even in an ideal zero-overhead wrapper.

JUCE's current render sequence iterates its operations on one calling thread: [JUCE 8.0.4 graph source](https://github.com/juce-framework/JUCE/blob/8.0.4/modules/juce_audio_processors/processors/juce_AudioProcessorGraph.cpp). Thus audio parallel routing currently sums branch CPU costs too. Independent branches are the opportunity for multicore execution. With total work `Wcpu`, critical-path cost `C` and `P` effective workers, an ideal lower bound is:

```
render time >= max(Wcpu/P, C) + scheduling/synchronisation overhead
```

Use a precompiled graph and a bounded persistent real-time worker pool, and process a plugin instance on only one thread at a time. Forward/join the host audio workgroup where supported; JUCE exposes the relevant AU callback. Apple explains the host workgroup contract in [Audio Unit auxiliary real-time threads](https://developer.apple.com/documentation/audiotoolbox/adding-audio-unit-auxiliary-real-time-threads-to-audio-workgroups). Bound aggregate workers across wrapper instances, respect plugins with internal workers, and retain a cheap single-thread path for small branches. Never launch threads, enqueue generic futures, allocate jobs or use unbounded waits in the callback.

The useful condition is `sum(branch times) - longest branch time > worker coordination cost`. Measure it. A 20-effect serial chain has almost no branch parallelism; adding threads cannot remove its dependencies. Block pipelining could trade additional block latency for throughput, but that is a separately disclosed mixing mode, not a transparent low-latency optimisation.

There is also a different opportunity in **sharing computation**: several sends can use one return effect if the intended routing is a single effect processing their summed input. That saves duplicated instances. For nonlinear effects, however, `F(x1+x2)` generally differs from `F(x1)+F(x2)`. Do not merge independent compressors or saturators just to reduce CPU. SIMD can improve wrapper gains, sums and meter scans; it cannot rewrite closed-source vendor DSP. Freezing/caching is useful for explicitly frozen, unchanged audio, not an arbitrary live stream.

The defensible product claim is an efficient, responsive host with measured low routing overhead and useful parallel scheduling for suitable graphs. A universal “faster than the native DAW” claim is currently unsupported. A wrapper can hide branch independence from the DAW scheduler and perform worse until its own scheduling is engineered and measured.

**Implementation order**

| Stage | Concrete deliverable | Exit evidence |
|---|---|---|
| 1 — Correctness and obvious cost | Meter recurrence/peak split; enabled latency buses; working dry/wet; correct bypass, PDC and host context; VST3 registration; safe proxy teardown | Graph impulses/null tests, counting processors, meter calibration, ASan lifecycle suite, repeat meter benchmark against production code |
| 2 — Fast editing and recall | Atomic graph transactions; persistent utilities; bounded asynchronous loading; stable automation assignments; complete session state | 20/40-plugin add/remove/preset stress, first-audio/readiness timings, correct failed-load behavior, recalled sound/automation identity |
| 3 — Routing capability | Explicit sends/returns/sidechains with a validated DAG compiler and gain laws | Reference render parity, nested routing/PDC/MIDI tests, bus/layout matrix |
| 4 — Optional multicore engine | Workgroup-aware bounded workers; graph-cost threshold; cross-instance budget | Lower p99/deadline misses than the single-thread baseline on genuinely parallel chains across supported DAWs |
| 5 — Release evidence | AU/VST3 host matrix, plugin validation, controlled DAW comparisons | Documented compatibility, no unintended audio changes, no unexplained dropouts, reproducible measurements supporting each marketing claim |

Start with stages 1 and 2. They address the measured overload and the exact rapid-loading/preset workflows requested. A complete scheduler replacement is not the first required change; JUCE already has a render-sequence handoff that avoids deleting old sequences on the audio callback and already provides PDC. Preserve those protections while removing the wrapper's defects.

**Required performance and release tests**

Measure total callback cost and incremental wrapper overhead separately. Compare the same plugin format, version, settings, sample rate and buffer size directly in the DAW versus inside ProChain. For parallel graphs compare the same signal topology, not just the same count of effects. Null-test deterministic paths; use appropriate tolerance or listening/reference tests for randomized/analog-modelled effects. Do not compare different quality or oversampling settings.

Cover 0/1/8/20/40/64 plugins; 44.1/48/96/192 kHz where supported; 32/64/128/256/512/1024 samples plus irregular sizes. Include cheap EQs, oversampling saturators, lookahead dynamics, convolution and tempo-synced modulation; matched serial, balanced/unbalanced parallel and shared-return configurations; UI open/closed and several ProChain instances. Exercise bypass, mute, solo, native preset browsing, wrapper preset browsing, plugin removal, automation, host save/restore, sample-rate changes, seeks and offline rendering during playback where the host permits.

Record callback p50/p95/p99/p99.9/max, actual deadline misses/dropouts, per-node cost, allocations and locks on the audio thread, real plugin load/restore durations, UI interaction latency, memory peak/steady state, and sample-accurate reported-versus-measured latency. Use a preallocated event ring for instrumentation; do not log strings or JSON from the audio callback. A short benchmark maximum is not a formal worst-case bound.

A proposed initial engineering target is routing/meter overhead below **5% of the block deadline at p99** on named reference hardware, with UI-only analysis disabled and the workload declared. At 48 kHz / 64 this is 66.7 microseconds. This is a target, not a result achieved by the current product; the all-full-meter recurrence experiment alone has p99 101 microseconds. The peak/full separation is therefore valuable even after fixing the recurrence. Define separate latency targets for accepting a UI action and finishing a vendor plugin's actual load; acknowledge requests promptly and show progress for slow factories.

**Verification completed and limits**

| Check | Observed result |
|---|---|
| Fresh isolated Release C++ shared-code build | Passed: `PluginChainManager` static shared-code target. Existing compiler warnings remain. |
| Fresh isolated C++ suite | **158/158 passed** via CTest. |
| Existing React suite, direct installed Vitest runner | **156 passed, 2 failed** across 15 files. Both failures are in onboarding scan-result tests, reading null `scanResult`. |
| Actual `ChainProcessor` synthetic graph probes | Reproduced bypass DSP, ineffective first dry/wet adjustment, missing short parallel branch, muted-branch PDC mismatch, lost earlier MIDI branch and lost group branch state. |
| Target-lifetime probe | Removed processor was no longer alive when the rebinding callback ran in the not-yet-rendered case. |
| Experimental enabled-delay constructor | Restored the parallel unit impulse from 0.5 to 1.0 at sample 64. |
| Experimental running-sum meters | 72.8× median improvement for the specified 42-meter / 48 kHz / 64 workload; short numerical comparison matched within 0.000048 dB. |
| Third-party loading, DAW performance comparison, UI walkthrough, AU/VST3 validation, signed package/distribution | **Not performed.** |

The existing build cache pointed at a different historical checkout path, so all native verification used a fresh temporary build with the locally available pinned dependencies. The normal pnpm command attempted dependency reconciliation and stopped on the existing lockfile/setup mismatch. No dependency purge/reinstall was performed; the UI suite was instead run through its already installed Vitest entry point. Its two failures are recorded in [ui-tests-direct.log](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/ui-tests-direct.log) and do not come from a production change made during this audit.

The C++ test target does not compile `ChainProcessor`, the outer processor, proxy pool, bridge or FFT. Its green result therefore cannot validate graph routing, plugin lifecycle or wrapper performance. The additional graph harness compiled the actual `ChainProcessor` and utilities, substituting only a synthetic plugin factory to keep the tests independent of installed plugins and user data.

Evidence and reproduction: [reproduce.py](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/reproduce.py), [graph_probe.cpp](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/graph_probe.cpp), [tests.log](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/tests.log), [plugin-build.log](/Users/test/Development/Projects/plugin-radar-monorepo/apps/desktop/docs/audits/evidence/2026-09-08/plugin-build.log). Run the Python reproducer with `--repo` pointing to this checkout on macOS; it creates a fresh temporary build, compiles only tests/shared-code targets, and runs synthetic probes without installing plugin formats. Dependencies are reused from the existing local cache when available; CMake may fetch the pinned public dependencies when they are absent. The experimental enabled-delay result is a separate one-constructor proof, not an integrated engine change.

The next implementation should turn the measured meter saving and the reproduced routing fixes into production changes, then establish full-chain/DAW measurements. This audit gives a concrete starting point; it does not establish launch readiness.
