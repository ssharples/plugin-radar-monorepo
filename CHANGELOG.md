# Changelog

## v1.0.0

Initial release of ProChain -- a plugin chain host for building, managing, and sharing audio plugin signal chains inside your DAW.

### Chain Editor

- **Tree-based chain editor** with serial and parallel group support
- **Drag-and-drop reordering** of plugins within and between groups
- **Per-plugin controls**: bypass, input/output gain, dry/wet mix, mute, solo
- **Parallel branch controls**: per-branch gain, solo, mute, ducking
- **Group nesting**: Create groups within groups for complex routing
- **Group templates**: Save and recall common group configurations

### Audio Processing

- **Automatic latency compensation** for parallel branches -- shorter branches are delayed to match the longest branch
- **Real-time audio visualization**: spectrum analyzer, per-node level meters, waveform display, LUFS metering
- **DryWetMix processor** with SmoothedValue crossfade for glitch-free blending
- **BranchGain processor** with multiplicative smoothing for clean level changes

### Plugin Management

- **Out-of-process plugin scanner** -- scanning runs in a separate helper process so crashes do not affect your DAW
- **AU and VST3 support** (macOS)
- **Plugin blacklisting** -- automatically blacklists plugins that crash during scanning; manually manageable
- **Plugin swap with parameter translation** -- swap a plugin for a similar one with intelligent parameter mapping (e.g., log, exponential, stepped curves)

### Presets and Snapshots

- **Preset save/load** with full chain state including plugin presets, group structure, and control settings
- **A/B/C/D snapshot recall** -- store and instantly switch between four chain configurations
- **Undo/redo history** for all chain operations
- **Format-agnostic preset data** -- presets are portable across AU and VST3

### Cloud and Social

- **Cloud chain saving** -- save chains to the ProChain cloud and access from any machine
- **Chain sharing via share codes** -- generate codes to share chains with anyone
- **Community chain browser** -- browse, search, filter, and sort chains uploaded by other users
- **Star ratings** (1-5) and **comments** on community chains
- **Chain forking** -- fork a community chain to create your own editable copy
- **User following** -- follow chain creators to discover their uploads
- **Plugin compatibility checking** -- see what percentage of a chain's plugins you already have installed

### Friends and Private Sharing

- **Friends system** -- add friends by username, email, phone, or Instagram handle
- **Friend requests** with accept/reject/block
- **Private chain sharing** -- send chains directly to friends
- **Received chains panel** -- view and load chains sent by friends

### Cross-Instance Awareness

- **Multi-instance detection** -- ProChain instances on different DAW tracks are aware of each other
- **Copy chains between instances** -- copy your chain or a selection to another instance
- **Send plugins between instances** -- move individual plugins across tracks
- **Mirror chains** -- set up live mirroring so changes in one instance are reflected in another

### Platform

- macOS (AU, VST3)
- Embedded React UI via JUCE WebBrowserComponent
- Convex cloud backend for auth, sync, and social features
- Session-based authentication with 7-day token expiry
