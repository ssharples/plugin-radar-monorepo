# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

### C++ (JUCE Plugin)
```bash
cd build && cmake .. && cmake --build . --target PluginChainManager_AU
```
Other targets: `PluginChainManager_VST3`, `PluginChainManager_Standalone`, `PluginScannerHelper`

### Frontend (React UI)
```bash
cd ui && npm run build          # TypeScript check + Vite production build
cd ui && npm run dev            # Dev server on port 5173
cd ui && npm run lint           # ESLint (strict: --max-warnings 0)
```

### Full Rebuild (UI → C++)
```bash
cd ui && npm run build && cd ../build && zip -r ../resources/ui.zip -j ../ui/dist/index.html && cmake .. && cmake --build . --target PluginChainManager_AU
```
The React build produces a single-file `dist/index.html` (via vite-plugin-singlefile). This gets zipped into `resources/ui.zip` which CMake embeds as BinaryData. You must re-zip and rebuild C++ after any frontend change.

## Architecture

**JUCE 8.0.4 audio plugin host** with an embedded React UI via `WebBrowserComponent`.

### C++ Layer (`src/`)
- **PluginProcessor/PluginEditor** — JUCE plugin entry points
- **core/ChainProcessor** — Extends `AudioProcessorGraph`, builds routing from the tree model
- **core/ChainNode** — Tree data model: `ChainNode` holds `std::variant<PluginLeaf, GroupData>`
- **core/PluginManager** — VST3/AU plugin discovery with out-of-process scanner for crash safety
- **bridge/WebViewBridge** — Registers native functions callable from JS, emits events to JS
- **bridge/ResourceProvider** — Serves the embedded UI zip to the WebBrowserComponent
- **audio/** — Signal processors: `DryWetMixProcessor` (4-in/2-out), `BranchGainProcessor`, `GainProcessor`, `AudioMeter`, `WaveformCapture`
- **automation/** — `ParameterProxyPool` + `ProxyParameter` for DAW parameter automation

### Frontend (`ui/src/`)
- **React 18 + TypeScript**, Zustand stores, Tailwind CSS, @dnd-kit for drag-and-drop
- **api/juce-bridge.ts** — Singleton `JuceBridge` class. Calls native via `window.__JUCE__.backend.emitEvent("__juce__invoke", ...)`, receives results via `__juce__complete` event with promise IDs
- **api/types.ts** — TypeScript types mirroring the C++ data model
- **stores/** — Zustand: `chainStore` (tree + flat compat), `pluginStore`, `presetStore`, `cloudChainStore`, `syncStore`, `usageStore`
- **components/ChainEditor/** — Main tree-based chain UI with `ChainNodeList`, `GroupContainer`, `ChainSlot`, `ParallelBranchControls`

## Native ↔ JS Bridge

**JS → C++**: `juceBridge.callNative('functionName', arg1, arg2)` sends args via `__juce__invoke`. JUCE dispatches to lambdas registered in `WebViewBridge::getOptions()`.

**C++ → JS**: `WebViewBridge::emitEvent("eventName", data)` → received by `window.__JUCE__.backend.addEventListener()`.

**Critical pattern**: New group operations pass args as `JSON.stringify({...})` which arrives as a `juce::var` string on the C++ side. Each handler must parse with `juce::JSON::parse(args.toString())` before calling `getDynamicObject()`. Older functions (addPlugin, removePlugin, etc.) pass primitive args directly.

## Data Model (V2 Tree)

- **Root node**: Always a Serial group with id=0
- **ChainNodeId**: `typedef int` — cannot overload methods with both `int` and `ChainNodeId` params
- **Groups**: Serial (sequential processing with dry/wet mix) or Parallel (branches with per-branch gain/solo/mute)
- **GroupData** must be defined before `ChainNode` in the header because `std::variant` requires complete types. `GroupData` uses `std::unique_ptr<ChainNode>` which only needs a forward declaration
- **Backward compat**: Flat `slots[]` maintained alongside tree `nodes[]` in both C++ (`getChainStateAsJson`) and React (`chainStore`)
- **AudioProcessorGraph** auto-sums when multiple connections target the same input channel (parallel fan-in)

## Cloud Backend (Convex)

- **Convex** (`ui/convex/`) — serverless backend with real-time reactive queries
- **URL**: `https://next-frog-231.convex.cloud`
- **Tables**: `users`, `chains`, `scannedPlugins`, `chainDownloads`, `chainLikes`, `pluginCatalog`
- **Deploy**: `cd ui && npx convex dev --once`
- **pluginCatalog**: Global deduped plugin registry keyed by `normalizedKey` (`name.toLowerCase()::manufacturer.toLowerCase()`). Populated from user syncs and chain saves.
- **Format-agnostic matching**: All plugin matching (compatibility checks, catalog lookups) uses case-insensitive `name::manufacturer` keys. C++ `jsonToNode()` already uses `equalsIgnoreCase()`.
- **Cross-format preset state**: JUCE `getStateInformation()`/`setStateInformation()` is format-agnostic — preset binary data is portable across AU/VST3.

## Spectrum Analyzer Architecture

**Custom Canvas visualizer** in React receiving FFT data from C++ via bridge (not SpectrexSDK or audioMotion-analyzer — neither works in WebView).

- **C++ side**: Use `juce::dsp::FFT` in `ChainProcessor` post-output. Compute magnitude spectrum, send frequency bin data to JS via `emitEvent("fftData", ...)` at 30fps.
- **JS side**: React `<SpectrumAnalyzer>` component renders on HTML5 Canvas 2D.
- **Reference implementations**: audioMotion-analyzer (AGPL, gradient/bar/octave band algorithms), ff_meters (BSD-3, `OutlineBuffer` for waveform).
- **Visualization modes**: bars, line/area, octave bands (1/3rd, full), gradient fills, peak hold/decay.
- **Why not SpectrexSDK**: Native OpenGL JUCE Component, cannot render inside WebBrowserComponent.
- **Why not audioMotion-analyzer**: Requires Web Audio API AudioNode connections, no API to push raw Float32Array from C++.

## Competitive Context (Waves StudioVerse)

Our product is a **vendor-agnostic StudioVerse alternative**. Key differentiators:
- **Cross-vendor**: Any VST3/AU plugin (StudioVerse is Waves-only — their #1 user complaint)
- **Advanced routing**: Serial/parallel groups with visual signal flow (StudioVerse is linear-only, 8 slots)
- **Richer social**: Comments, ratings, following, chain forking (StudioVerse only has likes)
- **Open catalog**: `pluginCatalog` table grows from all users, not locked to one vendor

## Useful JUCE Libraries (Researched)

- **[ff_meters](https://github.com/ffAudio/ff_meters)** (BSD-3) — Drop-in JUCE metering module, `OutlineBuffer` for waveform
- **[chowdsp_utils](https://github.com/Chowdhury-DSP/chowdsp_utils)** (321 stars) — DSP utilities, preset management, buffer math
- **[LUFSMeter](https://github.com/klangfreund/LUFSMeter)** (MIT) — ITU-R BS.1770 loudness measurement
- **[juce-webview npm](https://libraries.io/npm/juce-webview)** — Typed TypeScript bindings for JUCE WebView
- **[tomduncalf_juce_web_ui](https://github.com/tomduncalf/tomduncalf_juce_web_ui)** (MIT) — ValueTree-to-JS auto-sync, auto-generated TS types
- **[Open Audio Stack Registry](https://github.com/open-audio-stack/open-audio-stack-registry)** — Plugin catalog metadata spec
- **[UhbikWrapper](https://github.com/dlarseninclusive/UhbikWrapper)** (MIT) — OSS Combinator-style chain host, chain serialization reference
- **[Element](https://github.com/kushview/Element)** (GPL) — Full modular JUCE plugin host, architectural reference
- **[awesome-juce](https://github.com/sudara/awesome-juce)** — Master list of all JUCE OSS projects

## Key Constraints

- `DryWetMixProcessor`: 4 input channels (0-1 dry, 2-3 wet), 2 output channels. Uses `SmoothedValue` for crossfade
- `BranchGainProcessor`: Stereo gain with `SmoothedValue` (Multiplicative smoothing)
- Vite builds as IIFE (not ES modules) — required for JUCE WebBrowserComponent compatibility. A custom Vite plugin strips `type="module"` and `crossorigin` attributes
- The UI zip must be regenerated and C++ rebuilt after any frontend changes
