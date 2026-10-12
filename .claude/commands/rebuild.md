# Rebuild AU Plugin

Full rebuild pipeline: Desktop UI → zip → C++ AU plugin → install to system.

## Steps

1. Kill any zombie processes on port 5173
2. Build the desktop UI: `cd apps/desktop/ui && npx vite build`
3. If UI build fails, fix errors and retry before continuing
4. Package UI into zip: `cd apps/desktop/build && zip -r ../resources/ui.zip -j ../ui/dist/index.html`
5. Run CMake configure: `cd apps/desktop/build && cmake ..`
6. Build the AU target: `cmake --build . --target PluginChainManager_AU`
7. If C++ build fails, fix errors and retry before continuing
8. Install the AU plugin: `cp -r apps/desktop/build/PluginChainManager_artefacts/AU/ProChain.component ~/Library/Audio/Plug-Ins/Components/`
9. Verify installation: `ls -la ~/Library/Audio/Plug-Ins/Components/ProChain.component`
10. Report build status, binary size, and any warnings
