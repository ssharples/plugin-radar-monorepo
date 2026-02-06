# Plugin Radar Monorepo — Migration Log

## 2026-02-06 14:40 UTC — Migration started

### Step 1: Creating monorepo skeleton
- Created directory structure: convex/, apps/web, apps/desktop-ui, apps/desktop-native, packages/shared, scripts/, data/, docs/
- Setting up pnpm workspace

### Plan
1. ✅ Create monorepo skeleton
2. Merge schemas (most critical)
3. Merge all Convex functions
4. Move apps
5. Fix desktop-ui Convex imports
6. Update package.json files
7. Create shared package
8. Test deploy
9. Init git and push
