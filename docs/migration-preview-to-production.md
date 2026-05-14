# Preview → Production Migration Plan

**Status:** DRAFT — Peter's review required before any merge.
**Branch:** `feat/migrate-preview-to-prod` (cut from `peter/preview-home-redesign`)
**Author:** Claude (Opus 4.7, 1M context)
**Date:** 2026-05-13

---

## 1. Goal

Promote the Claude Design "Redesign" surface from `/preview/*` to the live
customer-facing routes:

| Mission Control task | Preview source | Production target |
| --- | --- | --- |
| P1 (this PR) | `/preview` (native React) — sourced from `app/preview/page.tsx` | `/` (`app/page.tsx`) |
| P2 (deferred) | `/preview/pages/public/pricing` (static HTML) | `/pricing` (does not exist) |
| P2 (deferred) | `/preview/pages/public/providers` (static HTML) | `/providers` (does not exist) |
| P2 (deferred) | `/preview/pages/app/models` (static HTML, renter-app surface) | `/marketplace/models` |
| P2 (deferred) | no public marketplace shell in bundle | `/marketplace` |

> The preview bundle's `app/Models.html`, `app/Marketplace.html`, etc. are
> renter-app pages (post-login) — they are NOT 1:1 replacements for the
> public marketing routes `/marketplace` and `/marketplace/models`.

## 2. Inventory — `/preview/*` routes

Discovered by reading `app/preview/pages/[...slug]/page.tsx` (the whitelist
map). Two kinds of preview routes exist:

### 2a. Native React port (1 route)

| URL | File | Mechanism |
| --- | --- | --- |
| `/preview` | `app/preview/page.tsx` (1494 LOC) + `preview.css` (502 LOC) + `data.ts` (94 LOC) + `i18n.ts` (332 LOC) + `layout.tsx` (Instrument Serif + Noto Naskh fonts) | Real Next.js client component |

This is the only preview route that is a real React component. Everything
else under `/preview/pages/*` is a static HTML shell served via iframe.

### 2b. Iframed HTML shells (`/preview/pages/<slug>`)

The whitelist in `app/preview/pages/[...slug]/page.tsx` mounts 50+ pages
from `public/preview-bundle/` via full-viewport iframe. None of these are
React. Migrating any of them to production means **porting HTML → React**,
not copying a file. Notable entries:

- `redesign`, `redesign-v1`, `kit` — design references
- `public/pricing`, `public/providers`, `public/about`, `public/contact`, `public/status`, `public` (hub) — marketing
- `docs` — three-pane docs app
- `app/*` (16 routes) — renter app screens
- `provider/*` (9 routes) — provider app screens
- `ops/*` (15 routes) — internal ops console
- `deck` — sales deck

P1 only touches the native React port. P2 routes are flagged in section 5.

## 3. Per-route diff & risk

### `/preview` → `/`  (P1, IN THIS PR)

| Aspect | Current `/` (`app/page.tsx`, 1025 LOC) | Preview `/preview` (1494 LOC) | Delta |
| --- | --- | --- | --- |
| **Hero copy** | `useLanguage()` keys (`landing.*`) — recently trimmed to inference-only (commit `70d03ff`) | Self-contained `DCP_I18N` dict in `app/preview/i18n.ts` (`hero.headline_1/2`) | Different i18n source; AR + EN strings live in `preview/i18n.ts` |
| **Layout** | `<Header>` + `<Footer>` from `app/components/layout/*`; intent toggle (renter/provider); launch banner; provider count widget; features grid; billing explainer | Self-contained nav (no shared `Header`/`Footer`); animated Saudi node map canvas (`HeroMap`); marquee; live marketplace strip; embedded playground demo; magnetic cursor buttons; reveal-on-scroll | Major visual overhaul; preview does NOT use the shared `Header`/`Footer` |
| **Fonts** | Inherited from `app/layout.tsx` (no Instrument Serif) | Adds `Instrument_Serif` + `Noto_Naskh_Arabic` via `app/preview/layout.tsx` | Need to load these fonts in root layout (or hoist to page) |
| **CSS** | Tailwind (`globals.css`, `dc1-*` tokens) | Hand-rolled CSS in `preview.css` (502 LOC, scoped to preview surface) | Must ship `preview.css` alongside; check for token collisions against `globals.css` |
| **Data fetching** | `usePublicMetricsContract()` — real backend snapshot (providers online/registered) | Static `marketplace`/`models`/`demoPrompts`/`demoResponses` arrays in `data.ts` — **fake demo data** | **High risk**: live homepage would stop showing real provider counts unless we splice the contract back in |
| **Role-intent persistence** | `persistRoleIntent` + `trackRoleIntentApplied` analytics | None — preview is pure marketing | Loss of analytics/intent funnel signal if straight-swapped |
| **i18n source** | `app/lib/i18n.tsx` (global `useLanguage` + keys `landing.*`) | Local `DCP_I18N` (`PreviewLang = 'en' \| 'ar'`) | Either wire preview keys into the global dictionary, or keep the local one and document the divergence |
| **Analytics** | `window.dispatchEvent('dc1_analytics', ...)`, GTM `dataLayer`, `gtag('event', ...)` | None | Must re-add analytics calls on CTAs before merge |
| **Banner** | `LaunchBanner` (`online === 0 && registered >= 40`) | None | Decision needed: keep launch banner on redesigned home, or drop |

**Migration approach for P1 (this PR):**

1. Move `app/preview/page.tsx` → `app/(home-redesign)/HomeRedesign.tsx` so
   `/preview` still works for design review, and `/` can render the new
   component.
2. Replace `app/page.tsx` body with `<HomeRedesign />` (preserving the
   metrics contract + analytics + role-intent persistence as a wrapper).
3. Hoist `Instrument_Serif` + `Noto_Naskh_Arabic` from
   `app/preview/layout.tsx` into the root `app/layout.tsx`.
4. Move `preview.css` → `app/(home-redesign)/home-redesign.css`. Scope check
   against `globals.css` token names.
5. Keep `data.ts` + `i18n.ts` co-located with the component. **Flag** to
   Peter that the live marketplace strip is currently fake data — wire to
   `/api/marketplace/gpus` in a follow-up.
6. Keep `app/preview/page.tsx` intact (re-export the new component) so the
   design review preview at `/preview` doesn't break.

**Risk: HIGH** — replaces customer-facing landing page. Must verify:

- No regressions in role-intent funnel analytics
- Provider count widget still reads from public metrics contract
- Arabic font (Noto Naskh) loads correctly across all pages, not just `/`
- `preview.css` does not leak into other routes (use CSS Modules or scoped class names)
- Lighthouse score not degraded (preview ships a canvas-based animated map + reveal observers)

### `/preview/pages/public/pricing` → `/pricing`  (P2, FLAGGED — NOT IN PR)

| Aspect | Detail |
| --- | --- |
| Preview source | `public/preview-bundle/public/Pricing.html` (142 LOC, vanilla HTML + `dcp-kit.css`) |
| Production target | **Route does not exist.** No `app/pricing/page.tsx` |
| Diff | N/A — there is no production file. Creating `/pricing` means porting the static HTML to a React page from scratch. The HTML contains a 4-column GPU price grid with mode tabs (per-token / per-hour / committed / reserved). Pricing values must come from the backend (`docs/FOUNDER-STRATEGIC-BRIEF.md` floor prices, not hardcoded). |
| i18n keys needed | New: `pricing.*` (hero, mode tabs, per-row labels, footnotes). EN + AR. |
| Assets | None new (uses existing `dcp-kit.css` fonts) |
| Backend deps | Must read from same source as `/marketplace` GPU pricing — currently `usePublicMetricsContract` does not expose per-GPU pricing |
| **Risk: HIGH** | Pricing display is legally sensitive (Saudi PDPL transparency, Moyasar billing) and economically sensitive (cost-plus rule from `feedback_cost_plus_pricing.md`). Cannot ship a hardcoded copy of the static HTML. |

### `/preview/pages/public/providers` → `/providers`  (P2, FLAGGED — NOT IN PR)

| Aspect | Detail |
| --- | --- |
| Preview source | `public/preview-bundle/public/Providers.html` (119 LOC) |
| Production target | **Route does not exist.** Existing `/provider` (singular) is the provider dashboard/onboarding hub — a different surface. |
| Diff | N/A — new route. `/provider` (singular, dashboard) and `/provider-onboarding` already exist; the marketing `/providers` (plural) is new. |
| Risk | MEDIUM. Marketing copy only; no live data. But naming collision risk with `/provider/*` (singular, app surface). |

### `/preview/pages/app/models` → `/marketplace/models`  (P2, FLAGGED — NOT IN PR)

| Aspect | Detail |
| --- | --- |
| Preview source | `public/preview-bundle/app/Models.html` (200 LOC) — **renter-app surface** (post-login model picker), not a public model catalog |
| Production target | `app/marketplace/models/page.tsx` (558 LOC) — public model catalog with live backend fetch |
| Diff | The preview is the wrong surface. The public `/marketplace/models` would need a NEW preview shell ported from the bundle's `public/*` family. The bundle does not include one. |
| Risk | HIGH. Wrong-source migration would replace the live public catalog with a logged-in model picker. **Block.** |

### `(no preview)` → `/marketplace`  (P2, FLAGGED — NOT IN PR)

| Aspect | Detail |
| --- | --- |
| Preview source | **None.** The bundle has `public/Index.html` (marketing hub) and `app/*` (renter app), but no `public/Marketplace.html`. |
| Risk | Can't migrate what doesn't exist. Block until design hand-over includes a public marketplace shell. |

## 4. Recommended order

1. **P1 (this PR)**: `/` only. Land first, watch analytics & error rates for 48h. Keep `/preview` alive for design review.
2. **P2.a**: design needs to produce a public `Marketplace.html` shell and confirm `Pricing.html` numbers are placeholders, not commitments.
3. **P2.b**: port `/pricing` second (no existing route, lowest collision risk). Wire to live pricing API. Add EN+AR keys.
4. **P2.c**: port `/providers` (marketing) — disambiguate naming vs `/provider` singular before shipping. Possibly rename route to `/become-a-provider` or `/for-providers`.
5. **P2.d**: skip `/marketplace/models` migration entirely — the preview source is the wrong surface (renter-app, not public). Re-scope.

## 5. Constraints honored

- Does NOT break `/preview` (kept as design-review surface)
- Does NOT touch production VPS, infra, or pricing logic
- Does NOT merge or deploy — Peter's review required
- Hits the "execute don't re-ask" bar for P1; flags P2 as a separate decision per "feedback_thinking_principles" (push back BEFORE acting if a simpler path exists)
- Per `feedback_cost_plus_pricing.md`: refuses to hardcode any pricing number from the static HTML into a production route
