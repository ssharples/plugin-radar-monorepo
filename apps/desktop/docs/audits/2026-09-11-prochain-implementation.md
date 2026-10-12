# ProChain performance and reliability implementation

Implementation and verification record, 11 September 2026. This covers the JUCE/React plugin in `apps/desktop`, following the [approved audit and release direction](2026-09-08-prochain-dsp-performance.md). Studio Time Machine, the website and Convex product behavior were outside this change.

The implementation is ready for the remaining Ableton acceptance work. Native regression tests, focused sanitizers, the production UI build, Apple AU validation and AU/VST3 pluginval validation pass. This is **not Ableton release certification**: the available Live set contained existing user work, and the packaged UI stopped at its sign-in screen. Both were left intact.

## What changed

| Area | Result | Main source |
|---|---|---|
| Metering and analysis | Full wrapper meters use double-precision running loudness sums; node meters use peak/hold processing. RMS response and stereo calibration are corrected. FFT uses a bounded worker queue with explicit ownership and reset generations. Waveform/FFT subscriptions follow the visible analysis mode. | `src/audio/AudioMeter.*`, `NodeMeterProcessor.*`, `FFTProcessor.*`, `WaveformCapture.*` |
| Gain matching | The processor owns matching even when the editor is closed. It applies a bounded absolute correction with smoothing, freezes the target during silence, and meters the output after manual output gain. | `src/audio/GainProcessor.*`, `src/PluginProcessor.*` |
| Routing | Prepared JUCE render graphs retain node lifetimes and supply PDC. Connections are checked. Serial and parallel dry/wet paths exist at initial full wet; parallel branch gain, averaging and mute/solo rules are preserved. Incoming parallel MIDI passes through once. | `src/core/ChainProcessor.*`, `ChainRenderGraph.*` |
| Bypass and Suspend | The hosted adapter keeps DSP running during Bypass. Suspend fades, stops DSP, and preserves the dry-path latency. Runtime controls do not rebuild the topology. Dynamic latency changes prepare replacement compensation; host context and conservative tails are forwarded. | `src/audio/HostedPluginProcessor.*` |
| Transactional editing | Adds, replacements, duplication, plugin-state imports, chain imports, preset loads and structural mirror updates prepare and validate candidates. Unchanged plugins retain their instances. One factory request runs with one latest pending request; stale completions are discarded. The audio handoff uses 5 ms fade-out, switch/latency priming and 5 ms fade-in. | `src/core/ChainTransactions.cpp`, `ChainProcessor.*`, `PresetManager.*`, `MirrorManager.*` |
| Failure and recall | Failed loads keep the current chain. Explicit partial restore keeps missing-plugin descriptions and opaque state in placeholders. Synchronous host restore stays separate from cancellable UI browsing and retains failed requested payloads for a subsequent save. Versioned wrapper state includes gains, matching, branch controls, bypass, suspension and bindings. | `src/core/HostRestoreAdapter.h`, `PresetManager.*`, `src/PluginProcessor.*` |
| Automation | The existing 2,048 host parameter IDs/order remain. Saved bindings use persistent plugin and child parameter identities. Legacy ordering migrates once. Removed targets leave inactive bindings. Host restore replaces assignments exactly; musical presets preserve occupied host slots. Listener retirement waits for active readers while targets remain alive. | `src/automation/AutomationBinding.*`, `ParameterProxyPool.*`, `ProxyParameter.*` |
| UI and lifecycle | Suspend and automation assignment use the existing rack. Typed load progress distinguishes requested and audible presets, failure and explicit partial recovery. Request IDs prevent late UI responses from replacing newer state. Closing editors destroys their native windows and removes bridge callbacks; scan notifications are throttled. Parameter discovery is cached and bounded. | `ui/src/components/ChainEditor/ChainSlot.tsx`, `PresetBrowser/PresetBrowser.tsx`, stores/bridge types, `src/bridge/WebViewBridge.*` |
| Packaging | AU, VST3 and Standalone development bundles embed the current scanner before ad-hoc signing. Builds no longer copy into installed plugin directories by default. Validation verifies the signed bundle and the exact registered AU executable. | `CMakeLists.txt`, `scripts/validate-release-bundles.sh` |

The [change inventory](evidence/2026-09-11-implementation/changed-files.json) and [source patch](evidence/2026-09-11-implementation/source-changes.patch) are relative to the backup taken at the start of implementation, not the repository's already dirty HEAD. The patch omits the binary UI archive; its hash is recorded separately. Unrelated staged and unstaged work was preserved. No commit, push or production release was performed. These are ad-hoc development signatures, not distribution signing or notarization.

## Verification results

| Check | Observed result | Evidence |
|---|---|---|
| Release native suite | 194 test cases, 11,976 assertions pass | [Native log](evidence/2026-09-11-implementation/native-tests.txt) |
| Actual wrapper/bridge suite | 11 test cases, 151 assertions pass | [Wrapper log](evidence/2026-09-11-implementation/wrapper-tests.txt) |
| AddressSanitizer | 35 chain/automation/analysis cases, 187 assertions pass | [ASan log](evidence/2026-09-11-implementation/asan-tests.txt) |
| ThreadSanitizer | The same 35 cases and 187 assertions pass | [TSan log](evidence/2026-09-11-implementation/tsan-tests.txt) |
| UI tests | 162 pass; the two previously identified onboarding tests still fail | [UI log](evidence/2026-09-11-implementation/ui-tests.txt) |
| Production UI and embedded archive | Vite build passes; 1,644 modules; current `ui.zip` embedded in rebuilt bundles | [UI build log](evidence/2026-09-11-implementation/ui-build.txt) |
| Native formats | AU, VST3 and Standalone build and sign successfully | [Build log](evidence/2026-09-11-implementation/native-build.txt) |
| Apple Audio Unit validator | `auval -v aumf Pcmg Pcmr` succeeds for the exact signed test build | [AU log](evidence/2026-09-11-implementation/auval.txt) |
| pluginval 1.0.4 | AU and VST3 pass strictness 5 at 44.1/48/96 kHz and 64/128/256/512/1024 frames; GUI tests explicitly skipped | [AU log](evidence/2026-09-11-implementation/pluginval-au.log.gz), [VST3 log](evidence/2026-09-11-implementation/pluginval-vst3.log.gz), [invocation/output](evidence/2026-09-11-implementation/pluginval-run.txt.gz) |
| Impeccable static check | No findings on the checked changed UI | [Detector output](evidence/2026-09-11-implementation/impeccable.json) |

The production regression suite covers actual chain impulse amplitude and latency, nested routing, first dry/wet adjustment, mute/solo and bypass/suspension behavior; failed, partial, superseded and replacement transactions; stable automation and retirement under concurrent processing; wrapper state and legacy V1 preset recall; closed-editor gain matching; repeated bridge destruction; and playhead, tempo, offline/reset, latency and tail behavior with synthetic hosted processors. These tests do not substitute for vendor behavior in Ableton.

The sanitizer configuration instruments `PluginChainManager_Tests`. It does not instrument the full wrapper/WebView target or certify third-party binaries. Host lifecycle entry points still depend on the host's normal audio-callback quiescence contract.

The two baseline UI failures are `records scanDurationMs on completion` and `includes blacklisted plugins in scan result` in `onboardingStore.test.ts`: both read a null `scanResult`. They are recorded separately and were not expanded into this implementation's scope.

## Rendered UI checks

The Codex browser was used to inspect the actual rack and preset components in [`ui/reliability-preview.html`](../../ui/reliability-preview.html), a development fixture with an in-memory bridge and synthetic data. The check exposed and corrected control overlap in the 439 px rack. Observed interactions include Suspend/Resume state, automation filter focus, Escape closing the panel and returning focus, the audible preset remaining selected after failure, and the explicit “Load available effects” action producing the partial result.

This fixture does not access accounts or call native plugins and is excluded from the production Vite entry. It is browser component evidence. The fresh Standalone app also rendered its real JUCE WebView, but authentication prevented inspecting the new rack and preset controls there. Full signed-in native UI and assistive-technology acceptance remain open.

## Callback performance

Reference machine: Apple M2 Max, Mac14,6, 64 GiB RAM, arm64, macOS 26.5.1, Apple LLVM 21.0.0, Release build, JUCE 8.0.4. Exact build hashes and environment are in the [manifest](evidence/2026-09-11-implementation/environment.json).

The benchmark calls the actual `PluginChainManagerProcessor`, with 20/40/64 synthetic stereo gain effects in a serial chain, 48 kHz, 64 warm-up callbacks and 5,000 measured callbacks per configuration. FFT/waveform subscriptions and gain matching are disabled. The direct baseline calls the same synthetic DSP instances without wrapper routing or metering. This was a normal shared desktop run, not an isolated real-time host session.

| Effects | Frames | Full wrapper p99 | Direct DSP p99 | Difference of p99s | Wrapper deadline misses |
|---:|---:|---:|---:|---:|---:|
| 20 | 64 | 47.708 µs | 18.417 µs | 29.291 µs | 0 / 5,000 |
| 20 | 128 | 65.084 µs | 27.875 µs | 37.209 µs | 0 / 5,000 |
| 20 | 512 | 229.333 µs | 119.000 µs | 110.333 µs | 0 / 5,000 |
| 40 | 64 | 73.542 µs | 35.583 µs | 37.959 µs | 0 / 5,000 |
| 40 | 128 | 129.541 µs | 63.334 µs | 66.207 µs | 0 / 5,000 |
| 40 | 512 | 346.459 µs | 195.000 µs | 151.459 µs | 0 / 5,000 |
| 64 | 64 | 74.708 µs | 22.375 µs | 52.333 µs | 0 / 5,000 |
| 64 | 128 | 130.291 µs | 61.709 µs | 68.582 µs | 0 / 5,000 |
| 64 | 512 | 486.250 µs | 236.291 µs | 249.959 µs | 0 / 5,000 |

The declared 20-effect, 64-frame target is met in this run: even the complete callback, including synthetic hosted DSP, is 3.58% of the 1,333.33 µs deadline, below the 5% / 66.67 µs wrapper-overhead budget. The complete 20-effect callbacks are also below 5% at 128 and 512 frames. This does not establish the same result for real plugins, other topology, UI activity or another machine.

Subtracting independent p99 values is an estimate, not a measured distribution of wrapper overhead. The full-callback bound is the stronger evidence for this workload. All p50/p95/p99/max measurements are retained in the [raw benchmark output](evidence/2026-09-11-implementation/wrapper-performance.csv); no deadline misses were observed across its nine configurations.

A separate [lifecycle benchmark](evidence/2026-09-11-implementation/wrapper-lifecycle-performance.csv) exercises one and four simultaneous wrappers, 20 effects each, over three construction/restore/destruction cycles. Each configuration measures 2,000 combined 64-frame callbacks after warm-up. Analysis mode enables subscriptions and periodically reads waveform/FFT frames outside callback timing; it is an **analysis-consumer simulation**, with no native editor created.

| Wrappers | Analysis consumer | Combined callback p99 range across three cycles | Deadline misses |
|---:|---|---:|---:|
| 1 | Off | 21.583–34.584 µs | 0 / 6,000 |
| 1 | Simulated | 29.625–36.250 µs | 0 / 6,000 |
| 4 | Off | 72.208–113.584 µs | 0 / 6,000 |
| 4 | Simulated | 107.083–130.292 µs | 0 / 6,000 |

Construction plus preparation took 10.97–13.59 ms for one wrapper and 40.84–44.12 ms for four. Construction, preparation and synchronous complete-state restore into replacement wrappers took 3.15–3.75 ms for one and 11.06–14.19 ms for four. These are synthetic control-thread wall times; they exclude real vendor costs, asynchronous preset-file parsing and a host-observed first-audible deadline.

Process RSS rose from 10.86 MiB initially to a 68.34 MiB high-water mark; the final post-destruction reading was 68.08 MiB. Live snapshots include the original and restored wrapper sets together. The process/framework allocators retain memory, and this short run neither proves nor disproves a leak. The raw output preserves current RSS before, while live and after release, plus macOS peak RSS in bytes. Sustained real-host memory acceptance remains open.

## Reproduction

Run from the repository root. A fresh build avoids the pre-existing cache with stale absolute paths:

```sh
cmake -S apps/desktop -B /tmp/prochain-release-build-20260911 \
  -DCMAKE_BUILD_TYPE=Release -DPROCHAIN_COPY_PLUGIN_AFTER_BUILD=OFF \
  -DFETCHCONTENT_SOURCE_DIR_JUCE="$PWD/apps/desktop/build/_deps/juce-src" \
  -DFETCHCONTENT_SOURCE_DIR_CATCH2="$PWD/apps/desktop/build/_deps/catch2-src"
cmake --build /tmp/prochain-release-build-20260911 --parallel 8 \
  --target PluginChainManager_Tests PluginChainManager_WrapperTests \
  PluginChainManager_AU PluginChainManager_VST3 PluginChainManager_Standalone
/tmp/prochain-release-build-20260911/PluginChainManager_Tests
/tmp/prochain-release-build-20260911/PluginChainManager_WrapperTests
/tmp/prochain-release-build-20260911/PluginChainManager_WrapperTests '[benchmark]'
/tmp/prochain-release-build-20260911/PluginChainManager_WrapperTests '[benchmark-lifecycle]'
```

The local JUCE/Catch2 cache overrides are optional where dependency fetching works. Configure separate sanitizer directories with `-DPROCHAIN_SANITIZER=address` or `thread`, build `PluginChainManager_Tests`, and run it with `'[chain],[automation],[analysis]'`.

```sh
cd apps/desktop/ui
npm test
npm run build
```

Rebuild `resources/ui.zip` with `apps/desktop/scripts/build-ui.sh` before rebuilding the native bundles after UI edits. The pre-existing local dependency links were broken; validation used a temporary dependency installation at `/tmp/prochain-ui-deps-20260911`, with the original UI dependency directory preserved at `/tmp/prochain-ui-original-node-modules-20260911`. Only ignored local resolution links were added; dependency manifests and the lockfile were not rewritten for this repair.

```sh
PLUGINVAL_BIN=/tmp/prochain-pluginval-1.0.4/pluginval.app/Contents/MacOS/pluginval \
  bash apps/desktop/scripts/validate-release-bundles.sh \
  /tmp/prochain-release-build-20260911/PluginChainManager_artefacts/Release \
  /tmp/prochain-pluginval-verified
```

AU discovery requires the exact signed bundle in the standard per-user Components directory. The script deliberately does not install or replace plugins. For this verification, neither ProChain format was already present there; two temporary test bundles were registered. Both have now been removed from plugin discovery directories and preserved under `/tmp/prochain-validation-uninstalled-20260911`, as recorded in the [cleanup manifest](evidence/2026-09-11-implementation/temporary-install-cleanup.json). Existing user plugins were unchanged. Final build products remain under the temporary build directory and are not production installations.

## Remaining release acceptance

1. Use a disposable Ableton Live 12.4.2 set and the signed-in ProChain UI to verify AU and VST3 transport, loops, tempo changes, automation, offline bounce, tails, project save/reopen and repeated editor open/close with real hosted effects. The current populated Untitled set was left untouched.
2. Compare real plugins against equivalent native Ableton chains with the same format, state and topology. Cover 20–40 effects, 64-effect stress, UI open/closed, multiple instances, vendor load milestones and sustained memory behavior. Synthetic test factories cannot certify vendor thread affinity, licensing dialogs, native editors or DSP costs.
3. Complete the native WebView keyboard/assistive-technology walkthrough after sign-in and resolve the two baseline onboarding failures before claiming the entire UI suite is green.
4. Apply distribution signing/notarization and a deliberate release/install decision only after the acceptance matrix passes. AUv3, instruments, expanded MIDI routing, shared returns/sidechains and multicore scheduling remain later milestones.
