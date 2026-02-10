---
description: Build-verify, commit, and push changes
---

Follow these steps exactly:

1. **Detect which projects changed** by running `git status` and `git diff --name-only`.

2. **Run builds for each affected project** (skip if no files changed in that area):
   - Desktop UI (`apps/desktop/ui/`): `cd apps/desktop/ui && npx vite build`
   - Web app (`apps/web/`): `cd apps/web && npx next build`
   - Convex (`convex/`): `cd /Users/dev/plugin-radar-monorepo && npx convex typecheck`
   - If ANY build fails, fix the errors before continuing. Do NOT commit broken code.

3. **Check for field name consistency** if Convex schema or mutations were changed:
   - Grep for any old/renamed field names that might still exist in callers
   - Verify `apps/desktop/ui/src/api/convex-client.ts` uses the correct field names (it uses `anyApi` so TypeScript won't catch mismatches)

4. **Stage changes** — use `git add` with specific files, not `git add -A`. Never stage `.env` files or credentials.

5. **Generate a commit message** by reviewing the staged diff:
   - Use conventional commit format: `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`
   - Keep the first line under 72 characters
   - Add a body if the change is non-trivial

6. **Pull and rebase** before pushing: `git pull --rebase`

7. **Push** to the current branch.

8. **Report** what was committed and pushed, including the commit hash.
