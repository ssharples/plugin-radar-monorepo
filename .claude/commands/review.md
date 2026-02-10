---
description: Review uncommitted changes for bugs and consistency issues
---

Perform a thorough review of all uncommitted changes. Follow this checklist:

1. **Get the full diff**: `git diff` (unstaged) and `git diff --cached` (staged).

2. **Field name consistency check**:
   - If any Convex schema fields were added/renamed/removed, grep the ENTIRE repo for the old name
   - Verify that `convex/schema.ts`, the mutation/query files, `apps/web/` callers, `apps/desktop/ui/src/api/convex-client.ts`, and `scripts/` all use identical field names
   - Flag any mismatches

3. **Bridge consistency check** (if WebView bridge was modified):
   - Verify C++ handler in `bridge/WebViewBridge.cpp` matches TypeScript in `ui/src/api/juce-bridge.ts`
   - Verify JSON shapes match on both sides
   - Check `ui/src/api/types.ts` is updated

4. **Dead code check**:
   - Look for unused imports, variables, or functions left behind by refactoring
   - Check for commented-out code that should be deleted

5. **UI consistency check** (if styling changed):
   - Grep for all instances of any changed component/class/color token
   - Flag any instances that were NOT updated

6. **Security check**:
   - No hardcoded secrets, API keys, or tokens
   - No `dangerouslySetInnerHTML` without sanitization
   - No unvalidated user input passed to queries

7. **Build verification**:
   - Run builds for affected projects (desktop UI, web, convex typecheck)
   - Report any build failures

8. **Summary**: List all issues found, categorized by severity (blocking / warning / nitpick).
