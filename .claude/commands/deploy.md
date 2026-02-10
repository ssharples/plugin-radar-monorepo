---
description: Build, verify, and deploy to production
---

Follow these steps exactly:

1. **Run `git status`** — if there are uncommitted changes, warn the user and ask whether to commit first or deploy anyway.

2. **Build all affected projects:**
   - Desktop UI: `cd apps/desktop/ui && npx vite build`
   - Web app: `cd apps/web && npx next build`
   - Convex typecheck: `npx convex typecheck`
   - If ANY build fails, stop and fix.

3. **Deploy Convex** (if convex/ files changed):
   ```
   cd /Users/dev/plugin-radar-monorepo && npx convex deploy
   ```

4. **Deploy web app** (if apps/web/ files changed):
   - Push to main branch (Vercel auto-deploys from main)
   - Or run `vercel --prod` if available

5. **Rebuild desktop UI zip** (if apps/desktop/ui/ files changed):
   ```
   cd apps/desktop/ui && npx vite build
   cd ../build && zip -r ../resources/ui.zip -j ../ui/dist/index.html
   ```
   - Remind user: C++ AU/VST3 must be rebuilt separately with CMake after ui.zip changes.

6. **Report** what was deployed and any manual steps remaining.
