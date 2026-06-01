# Phase 2 Quick-Start Guide

**⏰ Use this IMMEDIATELY after Phase 1 testing completes (2026-03-26 08:00 UTC)**

## One-Command Setup

```bash
cd packages/ide-extension
npm install --include=dev
npm run watch
```

That's it. You now have:
- ✅ Development build running with file watchers
- ✅ All dependencies installed (webpack, TypeScript, etc.)
- ✅ Ready to start editing source files
- ✅ Real-time compilation on save

## Development Workflow

### Step 1: Check Out Phase 2 Branch
```bash
git checkout ide-extension/phase2-provider-panel
```

Status: Feature branch with 912 lines of scaffolding
- ProviderNetworkPanel.ts (tree view skeleton)
- JobSubmissionModal.ts (webview skeleton)
- Type definitions for all features

### Step 2: Run Development Build
```bash
npm run watch
```

This watches for file changes and rebuilds automatically.

### Step 3: Test in VS Code
1. Open VS Code
2. Press `F5` to open Extension Development Host
3. Check: Extension loads without errors
4. Check: `DCP Provider` activity bar shows 3 tree views (from Phase 1)
5. Check: Output channel `DCP Provider` shows activation message

### Step 4: Start Implementing

#### Feature 1: Provider Status Panel (Hours 1-4)
- Edit: `src/providers/ProviderNetworkPanel.ts`
- Implement: `getChildren()` method to return provider list from API
- Implement: `startPolling()` to update tree every 3 seconds
- Test: Tree view shows 43+ providers from `/api/providers/public`

#### Feature 2: Job Submission Modal (Hours 5-9)
- Edit: `src/jobs/JobSubmissionModal.ts`
- Implement: Webview UI for model/provider/script selection
- Implement: `handleMessage()` to process form submissions
- Test: Command `DCP: Submit Job` opens modal and submits job

#### Feature 3: Testing & Polish (Hours 10-12)
- Run: `npm run lint` and fix TypeScript errors
- Run: `npm test` and ensure all tests pass
- Test: Extension bundle <550 KiB
- Check: No console errors in DevTools

## Quick Reference

### Build Commands
```bash
npm run compile      # One-time build
npm run watch        # Development with file watcher
npm run package      # Production build (creates .vsix)
npm run lint         # TypeScript linting
npm test             # Unit tests (if added)
```

### Debugging
1. **VS Code Extension Host:**
   - Press F5 to launch dev host
   - Breakpoints work in extension code
   - Output channel shows logs

2. **Webview Debug:**
   - Right-click in webview
   - "Inspect Element" to open DevTools
   - Console shows webview errors

3. **Common Issues:**
   - "Extension not loading?" → Check Output channel for errors
   - "TypeScript errors?" → Run `npm run lint`
   - "Build fails?" → Delete `dist/` folder and rebuild

### Testing Checklist

**Provider Status Panel**
- [ ] Tree view shows "Loading..."
- [ ] Tree view updates with provider list
- [ ] Updates every 3 seconds without lag
- [ ] Shows provider name, GPU model, cost/hr
- [ ] Shows 43+ providers without freezing
- [ ] Error state if API is down

**Job Submission Modal**
- [ ] Command `DCP: Submit Job` opens modal
- [ ] Template selector shows models with pricing
- [ ] Provider selector shows reputation/cost
- [ ] Script upload works
- [ ] Cost estimate calculates correctly
- [ ] Job submission succeeds
- [ ] Job status updates every 2 seconds

**Performance**
- [ ] Extension memory: <50 MiB
- [ ] CPU during polling: <20%
- [ ] Bundle size: <550 KiB
- [ ] No console errors

## API Endpoints (Reference)

### Providers
```
GET /api/providers/public
→ [{id, name, gpu_model, gpu_count, vram_mb, cost_per_hour_sar, jobs_completed, online}]

GET /api/providers/active  (auth required)
→ [{reputation_score, reliability_score, heartbeats_7d, completed_jobs}]

GET /api/providers/me  (for current provider if user is a provider)
```

### Jobs
```
POST /api/jobs  (auth required)
Body: {provider_id, model_id, script_content, parameters}
→ {job_id, status, estimated_cost_sar}

GET /api/jobs/{id}
→ {status, progress_percent, cost_incurred_sar, eta_seconds}

GET /api/templates
→ [{id, name, model_id, vram_required_mb, cost_per_hour_sar, tags}]
```

## Timeline

| Time | Task | Status |
|------|------|--------|
| 00:00 | Checkout branch, run watch | ✅ Ready |
| 01:00 | Provider panel working | Target |
| 05:00 | Job submission modal working | Target |
| 09:00 | Integration testing | Target |
| 12:00 | Polish, code review, ready for PR | Target |

## Success Criteria

**Must Have**
- ✅ Provider list shows 43+ online providers
- ✅ Job submission end-to-end works
- ✅ Real-time status polling (2-3s updates)
- ✅ <550 KiB bundle size
- ✅ Zero TypeScript errors
- ✅ No unhandled promise rejections

**Nice to Have**
- Error state displays for API failures
- Graceful degradation if API is down
- Comprehensive test coverage

## Rollback Plan

If you hit a blocker:
1. Stash current changes: `git stash`
2. Revert to Phase 1: `git checkout main`
3. Extension still works with Phase 1 features only
4. Ask for help/unblock, then `git stash pop` and continue

## Documentation

- **Full Implementation Guide:** `docs/PHASE2-IDE-EXTENSION-IMPLEMENTATION.md`
- **Type Definitions:** `src/providers/types.ts`, `src/jobs/types.ts`
- **Current Progress:** Git commit 83fe8c9

## Getting Help

If you hit an issue:
1. Check DevTools console for errors
2. Run `npm run lint` to find TypeScript issues
3. Look at Phase 1 code for API client patterns
4. Refer to VS Code API docs: https://code.visualstudio.com/api

## Next Steps After Phase 2

- Create PR from `ide-extension/phase2-provider-panel` to `main`
- Code review with PR requirements:
  - No `any` types
  - Error handling for all API calls
  - Zero console errors
- Once approved, merge to main
- Create deployment request for VPS

---

**You've got this! 12 hours to implement two major features.**
**Start with Provider Status Panel (simpler), then Job Submission Modal (more complex).**
**Phase 1 testing finishes 2026-03-26 08:00 UTC → You start 2026-03-27 00:00 UTC.**
