#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"

echo "=== Plugin Chain Manager Build Script ==="
echo ""

# Build UI first
echo "Step 1: Building UI..."
"$SCRIPT_DIR/build-ui.sh"
echo ""

# Create build directory
echo "Step 2: Configuring CMake..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure
cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
echo ""
echo "Step 3: Building C++ plugin..."
cmake --build . --config Release -j$(sysctl -n hw.ncpu 2>/dev/null || nproc)

echo ""
echo "=== Build Complete ==="
echo ""
echo "Plugin locations:"

# macOS
if [ -d "$HOME/Library/Audio/Plug-Ins/VST3/Plugin Chain Manager.vst3" ]; then
    echo "  VST3: ~/Library/Audio/Plug-Ins/VST3/Plugin Chain Manager.vst3"
fi
if [ -d "$HOME/Library/Audio/Plug-Ins/Components/Plugin Chain Manager.component" ]; then
    echo "  AU:   ~/Library/Audio/Plug-Ins/Components/Plugin Chain Manager.component"
fi

# Check for standalone
if [ -f "$BUILD_DIR/PluginChainManager_artefacts/Release/Standalone/Plugin Chain Manager.app" ]; then
    echo "  Standalone: $BUILD_DIR/PluginChainManager_artefacts/Release/Standalone/Plugin Chain Manager.app"
fi
