# ProChain User Guide

> ProChain is a plugin chain host that lets you build, manage, and share signal chains of audio plugins inside your DAW.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Scanning Plugins](#scanning-plugins)
3. [Building Chains](#building-chains)
4. [Presets and Snapshots](#presets-and-snapshots)
5. [Sharing Chains](#sharing-chains)
6. [Cloud Browser](#cloud-browser)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Cross-Instance Awareness](#cross-instance-awareness)
9. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Download and Install

1. Download ProChain from the official website.
2. Run the installer. ProChain is available as an AU and VST3 plugin for macOS.
3. Open your DAW and insert ProChain on a track. The embedded UI will load automatically.

### First Launch

On first launch, ProChain will guide you through an onboarding flow:

1. **Account creation** -- Create an account with email and password, or log in if you already have one.
2. **Plugin scan** -- ProChain scans your system for installed AU and VST3 plugins. This runs in a separate process for stability.
3. **Completion** -- Once scanning finishes, you are ready to build your first chain.

---

## Scanning Plugins

### How the Scanner Works

ProChain uses an **out-of-process scanner** to discover plugins on your system. This means plugin scanning runs in a separate helper process, so if a plugin crashes during scanning, it will not bring down your DAW.

The scanner looks for plugins in standard macOS locations:
- `/Library/Audio/Plug-Ins/Components/` (AU)
- `/Library/Audio/Plug-Ins/VST3/` (VST3)
- `~/Library/Audio/Plug-Ins/Components/` (user AU)
- `~/Library/Audio/Plug-Ins/VST3/` (user VST3)

### Blacklisting

If a plugin consistently causes scan failures, ProChain will automatically blacklist it. You can manage blacklisted plugins through the settings:
- View the blacklist to see which plugins are excluded.
- Remove a plugin from the blacklist to retry scanning it.
- Manually add a plugin to the blacklist if it causes issues.

### Troubleshooting Scans

- **Scan takes a long time**: This is normal on first run with many plugins. Subsequent scans are faster because results are cached.
- **Plugin not found**: Make sure the plugin is installed in one of the standard locations listed above. Try rescanning.
- **Scan crashes**: The out-of-process scanner should recover automatically. The problematic plugin will be blacklisted. Check the blacklist if you are missing expected plugins.

---

## Building Chains

### Adding Plugins

1. Click an empty slot or the "+" button to open the Plugin Browser.
2. Browse or search for a plugin by name, manufacturer, or category (EQ, compressor, reverb, etc.).
3. Click a plugin to add it to your chain.

### Chain Structure

ProChain uses a **tree-based chain model** with two types of groups:

- **Serial groups**: Plugins process audio one after another, in sequence. Think of it as a traditional insert chain. Serial groups support a global dry/wet mix control.
- **Parallel groups**: Audio is split into multiple branches that process simultaneously, then are summed back together. Each branch can contain its own serial chain. Parallel groups support per-branch gain, solo, and mute.

### Creating Groups

- Select one or more plugins and press **Cmd+G** to group them into a serial group.
- Use the group controls to switch between serial and parallel mode.
- Add branches to parallel groups using the "+" button on the group container.
- Nest groups inside other groups for complex routing.

### Drag and Drop

- **Reorder plugins**: Drag a plugin slot to move it within the chain.
- **Move between groups**: Drag a plugin from one group to another.
- **Add from browser**: Drag a plugin from the Plugin Browser directly into a chain slot.

### Per-Plugin Controls

Each plugin slot provides these controls:

| Control | Description |
|---------|-------------|
| **Bypass** | Bypasses the plugin (audio passes through unprocessed) |
| **Input Gain** | Adjusts the level going into the plugin |
| **Output Gain** | Adjusts the level coming out of the plugin |
| **Dry/Wet** | Blends between the unprocessed and processed signal |
| **Mute** | Silences the plugin's output entirely |
| **Solo** | Solos this plugin (mutes all others in the same group) |

### Parallel Branch Controls

Each branch in a parallel group has:

| Control | Description |
|---------|-------------|
| **Branch Gain** | Adjusts the level of this branch before summing |
| **Branch Solo** | Solos this branch (mutes all other branches) |
| **Branch Mute** | Mutes this branch entirely |
| **Ducking** | Ducks (reduces) this branch's level based on another branch's signal |

### Latency Compensation

ProChain automatically compensates for latency differences between parallel branches. If one branch has higher latency than another (e.g., a linear-phase EQ vs a simple saturator), ProChain adds delay to the shorter branches so all branches arrive at the sum point time-aligned.

---

## Presets and Snapshots

### Saving and Loading Presets

- **Save**: Use the Save menu in the header to save your current chain as a preset. Presets include all plugin states, group structure, and control settings.
- **Load**: Use the Load menu to browse and load saved presets.
- **Export/Import**: Presets can be exported as files and shared with other ProChain users.

Plugin preset data is format-agnostic -- presets saved with AU plugins will work when loaded as VST3 and vice versa.

### A/B/C/D Snapshots

ProChain provides four snapshot slots (A, B, C, D) for quick comparison:

1. Press **Cmd+1** through **Cmd+4** to recall snapshots A through D.
2. Make changes to your chain, then store to a different snapshot slot.
3. Switch between snapshots instantly to compare different settings.

### Undo and Redo

- **Cmd+Z**: Undo the last action.
- **Cmd+Shift+Z**: Redo the last undone action.

Undo/redo covers all chain operations: adding/removing plugins, reordering, changing group structure, and adjusting controls.

---

## Sharing Chains

### Cloud Save

Save your chains to the ProChain cloud to access them from any machine:

1. Make sure you are logged in.
2. Open the Save menu and choose "Save to Cloud".
3. Give your chain a name and optional description.
4. Choose whether the chain is public (visible to all users) or private.

### Share Codes

Generate a share code to send a chain to anyone:

1. Open the Share menu on a saved chain.
2. Copy the generated share code.
3. Send the code to another ProChain user.
4. They can enter the code in their Load menu to import the chain.

### Friends System

ProChain has a built-in friends system:

- **Add friends**: Search by username, email, phone, or Instagram handle.
- **Friend requests**: Accept or reject incoming requests.
- **Send chains**: Send chains directly to friends -- they appear in the Received Chains panel.
- **Block users**: Block users to prevent them from sending you friend requests or chains.

---

## Cloud Browser

### Browsing Community Chains

Open the Chain Browser to explore chains shared by the community:

- **Search**: Search by chain name, description, or included plugins.
- **Filter by category**: Browse chains by use case (mixing, mastering, vocal processing, etc.).
- **Sort**: Sort by rating, date, or download count.

### Compatibility Checking

When browsing cloud chains, ProChain shows a **compatibility badge** indicating what percentage of the chain's plugins you have installed. This helps you find chains you can actually use without needing to buy additional plugins.

### Ratings and Comments

- **Rate chains**: Give chains a 1-5 star rating.
- **Comment**: Leave feedback or ask questions about a chain.
- **Follow users**: Follow chain creators to see their new uploads.

### Forking

Fork a chain to create your own copy that you can modify:

1. Open a chain's detail page.
2. Click "Fork" and give your copy a name.
3. The forked chain appears in your saved chains, linked back to the original.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd+Z** | Undo |
| **Cmd+Shift+Z** | Redo |
| **Cmd+G** | Group selected plugins |
| **Cmd+1** | Recall snapshot A |
| **Cmd+2** | Recall snapshot B |
| **Cmd+3** | Recall snapshot C |
| **Cmd+4** | Recall snapshot D |
| **Delete / Backspace** | Remove selected plugin or group |
| **Cmd+D** | Duplicate selected plugin |
| **Cmd+A** | Select all plugins |
| **Escape** | Deselect / close modal |
| **Cmd+S** | Save current chain |

---

## Cross-Instance Awareness

When you have multiple instances of ProChain running on different tracks in your DAW, they are aware of each other:

### Copy Chain Between Instances

Copy your entire chain (or a selection) from one ProChain instance to another:

1. Select the plugins you want to copy (or select all).
2. Use the cross-instance menu to choose a target instance.
3. The chain is copied to the target instance.

### Send Plugins Between Instances

Move individual plugins between instances running on different tracks.

### Mirror Chains

Set up a **mirror** between two instances so that changes to one are automatically reflected in the other. This is useful for parallel processing setups where you want identical chains on multiple tracks.

---

## Troubleshooting

### Plugin Not Found After Scan

- Verify the plugin is installed in a standard location (see [Scanning Plugins](#scanning-plugins)).
- Check if the plugin is on the blacklist. Remove it and rescan.
- Some plugins may require their host application to be installed for the components to appear.
- Try a full rescan from the settings menu.

### Plugin Scan Crashes

- The out-of-process scanner should handle this gracefully. The crashing plugin will be blacklisted automatically.
- If scans keep failing, check Console.app for crash logs from the PluginScannerHelper process.
- Try removing recently installed plugins to identify the culprit.

### WebView Shows Blank Screen

- This can happen if the embedded UI failed to load.
- Try removing and reinserting the plugin on the track.
- Check that your macOS version is up to date (WebBrowserComponent requires a recent WebKit).
- If the issue persists, delete the plugin's cache folder and restart your DAW.

### Audio Glitches or Clicks

- Increase your DAW's audio buffer size.
- Check if a plugin in the chain is reporting very high latency, which can stress the compensation system.
- Try bypassing plugins one at a time to identify the source.
- Make sure your CPU is not overloaded -- check your DAW's CPU meter.

### Chain Won't Load from Cloud

- Verify you are logged in.
- Check your internet connection.
- If the chain uses plugins you don't have installed, those slots will appear as "missing". You can still load the chain -- missing plugins will be bypassed.

### DAW Hangs When Opening ProChain

- This is rare but can happen if a native dialog is triggered in a plugin context. Update to the latest version.
- Try loading ProChain on an empty track with no other plugins first.

---

*For additional support, visit the ProChain website or contact support.*
