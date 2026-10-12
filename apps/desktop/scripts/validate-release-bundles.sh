#!/usr/bin/env bash
set -euo pipefail

# Validate freshly-built bundles. AU discovery additionally requires CoreAudio
# registration of this exact build in the standard per-user Components folder.
# This script never installs or replaces plugins itself.
build_root="${1:-/tmp/prochain-release-build-20260911/PluginChainManager_artefacts/Release}"
validator="${PLUGINVAL_BIN:-/tmp/prochain-pluginval-1.0.4/pluginval.app/Contents/MacOS/pluginval}"
output_dir="${2:-/tmp/prochain-pluginval-results-$(date +%Y%m%d-%H%M%S)}"

vst3="$build_root/VST3/Plugin Chain Manager.vst3"
au="$build_root/AU/Plugin Chain Manager.component"

[[ -x "$validator" ]] || { printf 'pluginval not executable: %s\n' "$validator" >&2; exit 2; }
[[ -d "$vst3" ]] || { printf 'missing fresh VST3 bundle: %s\n' "$vst3" >&2; exit 2; }
[[ -d "$au" ]] || { printf 'missing fresh AU bundle: %s\n' "$au" >&2; exit 2; }
mkdir -p "$output_dir"

printf 'validator=%s\n' "$validator"
printf 'fresh_build_root=%s\n' "$(cd "$build_root" && pwd)"
printf 'output_dir=%s\n' "$output_dir"
printf 'vst3_bundle=%s\n' "$(cd "$vst3" && pwd)"
printf 'au_bundle=%s\n' "$(cd "$au" && pwd)"

common=(--strictness-level 5 --sample-rates 44100,48000,96000
        --block-sizes 64,128,256,512,1024 --skip-gui-tests
        --timeout-ms 30000 --verbose --output-dir "$output_dir")

# Absolute bundle paths are intentional. In particular, do not replace the
# AU path with an AudioUnit ID: that would allow pluginval/CoreAudio to resolve
# an older installed copy and would no longer prove this fresh build.
/usr/bin/codesign --verify --deep --strict "$vst3"
/usr/bin/codesign --verify --deep --strict "$au"
registered_au="$HOME/Library/Audio/Plug-Ins/Components/Plugin Chain Manager.component"
if ! /usr/bin/diff -qr "$au" "$registered_au" >/dev/null 2>&1; then
    printf 'AU validation requires the exact signed build registered at: %s\n' "$registered_au" >&2
    exit 2
fi
printf 'running VST3 validation\n'
"$validator" --validate "$vst3" "${common[@]}" \
    --output-filename prochain-vst3.log

printf 'running AU validation against absolute fresh bundle path\n'
"$validator" --validate "$au" "${common[@]}" \
    --output-filename prochain-au.log

printf 'validation logs: %s\n' "$output_dir"
