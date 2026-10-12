# Validation — 11 September 2026

The tooling is implemented for the C++ plugin and its TypeScript frontend. This is local working-tree evidence; no CI run, branch-protection update, commit, push or release was performed. Mull was configured only, as requested.

## Passing proof cases

| Scope | Tests | Worst CRAP | Mutation |
| --- | --- | --- | --- |
| `usageStore.ts` | 46 related tests pass, including 7 new store tests | 5; 11 functions; no N/A | 58 killed, 0 survived, 0 invalid, 0 equivalent, 0 unresolved; 100% |
| `DSPUtils.h` | 194 core cases / 11,976 assertions and 11 wrapper cases / 151 assertions pass | 3; 4 functions; no N/A | Configuration prepared; not executed |
| Quality infrastructure | 48 Python tests and 3 JS adapter tests pass | Outside plugin production scope | Not applicable |

The usage-store tests found a real assertion gap: a mutation could make the first load count two while the tests checked only the count after two loads. The new first-load assertion kills that mutant. The only production edit consolidates repeated checks for a missing usage record into one typed empty-record fallback. It preserves existing field defaults, counts, timestamps and co-usage behavior. Optional chaining and default arguments are counted as decisions; the simplified callback scores 5.

The frontend Vite production build passed (1,644 modules). Vitest excludes generated Stryker sandboxes, and Stryker cleans them after both successful and failed runs. The package manager is pinned to pnpm 8.15.9, matching the existing lockfile; the lockfile and workspace manifest retain their original contents.

Native Debug execution also emits JUCE timer/assertion and shutdown leak diagnostics in the core test process. Catch2 returns success. These diagnostics remain in the command logs; a CRAP pass is not a clean native-host or leak-check result.

## Existing full-surface baseline

| Surface | Discovered functions | CRAP above 6 | N/A | Worst scored function |
| --- | ---: | ---: | ---: | --- |
| C++ | 836 | 207 | 137 | `WebViewBridge::assignAutomation`: CC 16, CRAP 272 |
| TypeScript frontend | 1,215 | 284 | 78 | `ChainEditor.tsx` callback at line 227: CC 47, CRAP 2,256 |

These audits fail. N/A includes missing instrumented functions, missing executable line mappings and source-parser limitations. There are 16 C++ parse diagnostics across seven files and three TSX parse diagnostics for raw JSX ampersand text. Such functions remain unscored and blocking; no production exclusions or equivalent exemptions were added. The diagnostics mean these are discovered function counts, not proof that unsupported files were fully analyzed.

The ordinary full frontend suite reports **169 passing and 2 failing tests**, both in `onboardingStore.test.ts` where `scanResult` is null. The full-surface coverage run reports **151 passing and 4 failing related tests**, including those two failures and two onboarding authentication integration failures. Coverage-run failures are preserved and block mutation. Copied/test-only logic is not accepted as production coverage.

## Commands and artifacts

Executed from the repository root:

```sh
npm run quality:test
npm run quality:gate -- --files apps/desktop/ui/src/stores/usageStore.ts --report-dir reports/quality/ui-proof
npm run crap -- --files apps/desktop/src/audio/DSPUtils.h --report-dir reports/quality/native-proof
npm run quality:mutation-config -- --files apps/desktop/src/audio/DSPUtils.h
npm run crap -- --all --surface cpp --report-dir reports/quality/native-proof
npm run crap -- --all --surface desktop-ui --report-dir reports/quality/baseline-ui
```

The native proof snapshot is preserved as `reports/quality/native-proof/proof-crap.json`; that directory's current `crap.json` is the full C++ baseline. The UI proof has `crap.json`, `mutation.json` and the Stryker HTML/JSON under `reports/quality/ui-proof/`. The UI baseline is `reports/quality/baseline-ui/crap.json`. Native build/test logs and original LLVM coverage are under each coverage directory. `reports/quality/mutation-config/plan.json` is a reviewable build/run recipe with `executed: false` in its adapter result.

The workflow YAML parsed successfully, and a pnpm 8.15.9 frozen-lockfile check succeeded. CI execution remains unverified until the workflow is pushed and run.
