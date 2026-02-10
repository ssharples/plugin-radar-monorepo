---
description: Build all projects and report results
---

Build every project in the monorepo and report results:

1. **Desktop UI**: `cd apps/desktop/ui && npx vite build`
2. **Web app**: `cd apps/web && npx next build`
3. **Convex typecheck**: `cd /Users/dev/plugin-radar-monorepo && npx convex typecheck`

Report a pass/fail summary for each. If any fail, show the first error and suggest a fix.
