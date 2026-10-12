# Plugin quality gates

See [local validation and existing baseline failures](VALIDATION.md).

Scope: the C++ plugin in `apps/desktop/src/` and its TypeScript/React frontend in `apps/desktop/ui/src/`. Studio Time Machine, the website, Convex and shared backend modules are outside this configuration.

## Commands

Use Python 3.10+ and Node 24. The root package manager is pinned to pnpm 8.15.9 to match the existing lockfile; install the frontend's normal dependencies with the repository's pnpm 8 lockfile first. The additional tools have isolated, pinned dependencies and do not alter the workspace lockfile:

```sh
pnpm install --frozen-lockfile --filter desktop-ui
npm run quality:setup
npm run quality:test

# All locally changed plugin production modules (staged, unstaged, untracked)
npm run crap
npm run mutate

# A specific module or several exact paths / quoted globs
npm run quality:gate -- --files apps/desktop/ui/src/stores/usageStore.ts
npm run crap -- --files apps/desktop/src/audio/DSPUtils.h

# Review all changes since a branch's merge base
npm run quality:scope -- --base origin/main
npm run crap -- --base origin/main

# Full inventory audit; deliberately not supported for mutation
npm run crap -- --all

# Prepare the C++ mutation build/run plan without installing or running Mull
npm run quality:mutation-config -- --files apps/desktop/src/audio/DSPUtils.h
```

`mutate` and `quality:gate` both refresh relevant tests and coverage, require CRAP to pass, then mutate the selected modules. `--surface cpp|desktop-ui` limits a changed-surface run. `--report-dir PATH` keeps separate run evidence; the default is `reports/quality`. `--files-json PATH` accepts an array of repository paths. With no explicit selection or base, changes are relative to HEAD; CI supplies the PR base. Deleted files are omitted, renamed files use their current path. No broad production allowlist is used. Tests, fixtures, generated files and vendor code are excluded by their role/location.

The initial setup does **not** install or rebuild LLVM or Mull. C++ mutation remains configured, unmeasured and blocking until a matching native toolchain is explicitly supplied. Configuration is never a mutation pass.

## CRAP

The small Tree-sitter adapter inventories declarations, methods, inline functions, lambdas and nested callbacks. Existing poly-crap does not cover both this C++ surface and its callback inventory. Each function owns its decisions; nested functions are scored separately. Cyclomatic complexity starts at 1 and counts conditionals (including explicit else), loops, switch arms/default, logical operators, optional chaining, default parameter/pattern values, catch and ternaries. CRAP is `CC² × (1 − coverage)³ + CC`, with a maximum of **6 per function**. At full coverage it equals CC.

The frontend uses Vitest's dependency graph for relevant tests and Istanbul's original-source function/branch maps. C++ builds both Catch2 targets in an isolated Debug build using matching Clang, llvm-profdata and llvm-cov, then exports LLVM JSON. Branch coverage takes precedence. Functions without instrumented branches use executable line coverage. This does not claim path coverage. Repeated exports merge observed hits, rather than averaging percentages. Source columns follow each provider's convention, including UTF-16 columns for Istanbul. Missing Istanbul end columns are preserved as unknown; mapping uses the exact original-source start position.

Missing file/function coverage or unsupported syntax is **N/A**, never zero, and fails the gate. Instrumented but unexecuted functions legitimately have zero coverage. No report, failed tests, stale source, or parser errors can establish a pass. An existing high-complexity function stays red even at 100% coverage; no global 100% coverage requirement is introduced.

Inspect `crap.txt` (descending scores) and `crap.json` (every function, basis, counts, reasons, source hashes and commands). Build/test output stays beside the coverage reports. Use `--all` for a baseline inventory; installing these gates does not mean existing production code passes them.

## Mutation

The frontend uses Stryker 10 with its Vitest runner, per-test coverage, selected source files, at most **3 workers**, and a **5 second** timeout plus a 1.5× test-duration allowance. No incremental cache is used, so changed tests and configuration cannot leave stale killed results. Native configuration targets Mull 0.34 with the `cxx_all` operators, exact source-path filters, both native test binaries, **3 workers** and a **30 second timeout per test run**. Uncovered native mutants remain visible. Large scopes should be split into files; keep the gate.

The policy evaluates each selected file independently:

- `score = killed / (killed + survived)`, minimum **80%**.
- `Killed` means a test failed; `NoCoverage` counts as survived.
- Compile errors and documented equivalents are excluded from the denominator.
- Timeouts, runtime errors and ignored/pending mutants are unresolved and block the gate; they do not inflate the score.
- Easily killable surviving changes (operator flips, predicates, removed guards/statements and altered returns) also block, even above 80%.
- No eligible mutants is N/A and fails, rather than silently reporting 100%.

Inspect `mutation.json` for per-module counts, source locations, replacement text and stable IDs. The UI also emits `mutation/desktop-ui/mutation.html` and the original Stryker JSON. Read every survivor's diff; the operator classification is a conservative aid, not a substitute for review. The native adapter combines the two binaries: a test failure in either kills a shared mutant, and unresolved outcomes remain blocking otherwise.

A truly equivalent mutation needs an exact SHA-256 identity and a behavioral proof in `tools/quality/equivalents.json`. Its identity includes the complete source hash, path, location, operator and replacement, so a code edit invalidates the exemption. Never use wildcard exemptions, excluded production files, metric-specific behavior, tautological tests or unreadable helper extraction to make a number pass. Vendor mutator exclusions are not configured.

## Native toolchain

Coverage defaults to Xcode's four matching LLVM tools on macOS. Overrides are `CLANG`, `CLANGXX`, `LLVM_COV`, `LLVM_PROFDATA` and optionally `CMAKE`; all LLVM tools must come from the same installation and major version. Compiler driver names are preserved (`clang++` must not become `clang`). The isolated build reuses downloaded JUCE/Catch2 sources when available, never old compiled test binaries, and disables plugin copying.

For future Mull execution, install a mutually compatible Clang/Mull toolchain explicitly, then set the same four LLVM variables plus `MULL_RUNNER`, `MULL_IR_FRONTEND` and `MULL_LLVM_MAJOR`. The frontend must match the compiler ABI; `MULL_LLVM_MAJOR` records the installed Mull package's LLVM major, it is not an override for incompatibility. The adapter generates `mull.yml`, adds `-fpass-plugin` during a fresh isolated build, passes `MULL_CONFIG` to build and execution, and requires fresh Elements JSON. It does not run against the normal app build. `mutation-config/plan.json` contains the reviewable argument arrays and required environment variables. Actual Mull execution has not been validated on this machine because native installation was explicitly deferred.

References: [Mull CMake integration](https://mull.readthedocs.io/en/latest/tutorials/CMakeIntegration.html), [Mull runner options](https://mull.readthedocs.io/en/latest/command-line/mull-runner.html), [Stryker Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).

## Standing workflow and CI

For each production change: pass relevant acceptance/unit tests, run CRAP, add behavioral tests for uncovered branches, and extract cohesive helpers only when the function still has too many decisions. Then run mutation on the same modules, inspect survivors, strengthen tests, and repeat until both thresholds and survivor policy pass. Preserve public behavior. Report commands, worst CRAP, mutation counts/scores, survivors, equivalents and all N/A reasons.

`plugin-quality.yml` runs adapter contract tests and automatic CRAP for every changed plugin surface on PRs and main pushes. C++ uses macOS; the UI uses Linux. A manual dispatch can also run differential UI mutation with a 20-minute job limit. Mutation remains a required local/agent gate for production changes; native CI mutation is deferred with the native toolchain. These workflows become effective after the files are pushed; protected-branch required-check settings must be configured by the repository owner if desired.
