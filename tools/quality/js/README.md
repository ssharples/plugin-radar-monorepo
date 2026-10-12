# Isolated frontend adapter

See [the plugin quality workflow](../README.md) for commands, thresholds and report interpretation. `run.mjs` is invoked by the Python gate; it uses the plugin's Vitest configuration and source dependencies, with pinned coverage/Stryker dependencies from this directory. Do not run raw Stryker before the CRAP preflight.
