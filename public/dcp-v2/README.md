# Handoff: DCP v2 — Sovereign Arabic AI Platform

## Overview

This is the full v2 redesign of **DCP** (DC Power Solutions Company) — a Saudi platform that sells **Arabic-first AI inference and agents**, served from in-Kingdom GPUs, billed per token in Saudi Riyal (SAR). DCP has three audiences:

1. **Renters** — developers/companies who consume inference via an OpenAI-compatible API and run agents.
2. **Providers** — people with consumer/workstation GPUs (RTX 3060 Ti → 5090, Apple Silicon) who earn SAR by serving jobs on the DCP mesh.
3. **Visitors** — prospective customers landing on the marketing site.

The bundle covers the public marketing site, the renter console, the provider console, the provider onboarding wizard, auth/onboarding, and API docs.

## About the Design Files

The files in `prototypes/` are **design references created in HTML/CSS/vanilla JS** — they show the intended look, layout, copy, and interaction behavior. **They are not production code to copy directly.** The task is to **recreate these designs in the target codebase's environment** (the live product is React on Vercel) using its established component patterns, router, data layer, and state management. Where these prototypes use inline `<script>` for demo interactivity (chart rendering, wizard steps, language toggle), reimplement that logic idiomatically in the target framework.

If no front-end environment exists yet, React + TypeScript with CSS Modules or Tailwind is the recommended choice (matches the current stack).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, copy (EN + AR), and interactions are all specified. Recreate pixel-faithfully using the codebase's component library. The one exception: data is mocked inline — wire real APIs in their place.

---

## Design Tokens

All tokens live in `assets/dcp-kit.css` as CSS custom properties under the `midnight` palette (the production default). Reproduce these exactly.

### Color — Midnight palette (default, dark)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0a0b1a` | Page background (deep indigo) |
| `--bg-2` | `#10122a` | Inset surfaces, inputs |
| `--paper` | `#161834` | Elevated cards |
| `--ink` | `#f5f3ee` | Primary text (warm bone) |
| `--ink-2` | `#c9c5bd` | Body text |
| `--mut` | `#7b7a92` | Muted / mono labels |
| `--dim` | `#4e4d67` | Placeholder |
| `--line` | `#272848` | Card borders |
| `--hair` | `#1f2040` | Hairline dividers |
| `--teal` | `#2dd4b6` | Brand accent / success / renter accent |
| `--orange` | `#ee7a3c` | Brand accent / warning / provider accent |
| `--err` | `#ef4062` | Error / destructive |

The brand also defines **paper** (cream, light) and **mono** (pure B/W print) palettes via `html[data-palette="paper"|"mono"]` — see `dcp-kit.css`. v2 surfaces use **midnight** only.

### Gradient
`--grad: linear-gradient(90deg, #2dd4b6 0%, #2dd4b6 28%, #6bb39a 55%, #ee7a3c 100%)` — teal→orange. Used for: italic emphasis words inside serif headlines (`<em>` background-clip:text), the logo's ∞ glyph, 2px accent bars on featured cards, slider thumbs.

### Logo
DCP wordmark + **∞** glyph. The ∞ always carries the gradient `linear-gradient(90deg,#2dd4b6 0%,#6bb39a 55%,#ee7a3c 100%)` via background-clip:text. Square logo image at `assets/dcp-logo-square.jpeg` (gradient ∞ on deep navy). **Do not** animate or recolor the ∞ — static gradient only.

### Typography
| Family | Stack | Use |
|---|---|---|
| Serif | `'Instrument Serif', 'Times New Roman', serif` | Headlines, stat values, big numbers (weight 400 only) |
| Sans | `'Inter', system-ui, sans-serif` | Body, UI, labels |
| Mono | `'JetBrains Mono', ui-monospace, monospace` | Eyebrows, section meta, code, tabular data, IDs |
| Arabic | `'Noto Naskh Arabic', serif` | All Arabic text (weight 700 for headlines) |

Type scale: hero `clamp(56–168px)`, section titles `clamp(40–80px)`, step headlines `clamp(30–46px)`, stat values 30–64px, body 14–19px, eyebrow/mono-label 10.5–11px with `.14em–.18em` letter-spacing uppercase.

### Spacing / radius / shadow
- Border radius: **2px** is the house default (sharp, technical). Pills 999px. A few large cards use 12–14px in lighter contexts.
- Card padding: 22–36px. Section vertical rhythm: ~28px between stacked panels.
- Featured cards get a 2px gradient top edge (`::before`, `inset:-1px -1px auto -1px; height:2px; background:var(--grad)`).
- Shadows are rare in midnight; elevation comes from `--paper` vs `--bg` + borders. Focus rings use accent-colored 3px soft glow.

### Bilingual / RTL (non-negotiable)
Every surface is EN + AR. Root carries `lang`, `dir` (`ltr`/`rtl`), `data-lang`. Pattern in prototypes: elements carry `data-en` / `data-ar` attributes; a toggle swaps `innerHTML` and flips `dir`. **In production, use the app's i18n system (e.g. i18next) with EN/AR resource bundles and logical CSS properties (`margin-inline-start`, `border-inline-end`, etc.) for automatic RTL.** Arabic uses Noto Naskh Arabic; numerals render Arabic-Indic. Never put translatable text on a container that wraps a persistent child (id/anchor) — wrap only leaf text.

---

## Surfaces / Screens

### A · Public marketing site

**`prototypes/Home.html`** — the homepage. Sections in order:
- **Marquee** (top) — scrolling mono strip of plain-language claims (in-Kingdom inference, pay per token in SAR, DCP-Agent at agents.dcp.sa, earn from your GPU, PDPL).
- **Nav** — serif-italic-on-active mono nav (Overview · Marketplace · Agents · Pricing · Docs), EN/ع pill, Sign in + Start free. Collapses to a full-screen mobile takeover menu below 760px (large serif link list with Arabic subtitles, staggered fade-in).
- **Hero** — `clamp` serif headline "Arabic AI that *lives in the Kingdom.*" + lead + CTAs. Background: a **hand-traced SVG map of Saudi Arabia** with 4 pulsing region nodes (RUH/JED/DMM/NEOM) connected by animated dashed mesh links, masked to the right ~62%, plus a dawn-glow radial gradient at the bottom. Respects reduced-motion.
- **How it works** — large animated DCP∞ wordmark + a 6-station round-trip flow (Arabic in → ALLaM AR→EN → Router → Best model → ALLaM EN→AR → Arabic out) with a traveling pulse-dot along the rail. All KSA-flagged; station 04 marked frontier opt-in.
- **Marketplace** (`#marketplace`) — live mesh-utilisation meter + GPU table (class/provider/region/util/SAR-per-hr/reliability). Callout: "You buy tokens, not GPUs."
- **Three layers** — Inference / Agents / Providers cards.
- **Quick start** — cURL/Python/Node tabs (OpenAI-SDK drop-in).
- **Models** — card grid (Arabic-first lineup + frontier opt-in), no over-disclosure of internals.
- **DCP-Agent** (`#agents`) — short pitch linking to agents.dcp.sa (SMB product live; personal AI coming).
- **Arabic wedge**, **Two paths in** (renter vs provider), **Pricing snapshot**, **Compliance band** (PDPL · Saudi residency · ZATCA · CR 7053667775), **Enterprise band**, **End CTA**, **Footer sitemap** (Product / Build / Renters / Providers — every link resolves to a real page).

Copy voice (critical): **outcome-led, not parts-list.** No invented metrics, no fabricated provider counts, no "since 2025", no model-name name-dropping in hero/marketing, no invented compliance certs (only PDPL + ZATCA + CR are real). "Frontier models stay off until you turn them on — your data, your decision."

**`prototypes/Auth.html`** — sign in / create account toggle; Nafath + Google + email (magic link); Najdi square-Kufic brand panel; routes to Setup (signup) or renter Dashboard (signin).

**`prototypes/Setup.html`** — renter 4-step onboarding wizard (use case → workspace → API key reveal → first call).

**`prototypes/docs/Docs.html`** (+ `docs/docs-shell.css`) — three-pane API reference (left nav, center content, right TOC). OpenAI-compatible base URL `https://api.dcp.sa/v1`, quickstart tabs, param tables, Arabic + residency guides.

> Note: `Pricing.html`, `Demo.html`, `Sovereignty.html`, `Stage 1.html` are **earlier explorations**. Pricing/Demo/Sovereignty were de-scoped as standalone pages (Demo folds into the landing). Treat them as reference only unless the team revives them.

### B · Renter console — `prototypes/renter/`
Shared chrome: `renter-shell.css` + `renter-shell.js` (inject sidebar + topbar; **teal** accent). Sidebar: workspace switcher, wallet balance + 7-day burn + Top-up, nav (Build / Spend / Account).
- **Dashboard.html** — KPIs, 30D spend chart (hover tooltip, 7/30/90 toggle), live jobs, 3-tab quickstart.
- **Playground.html** — model picker, params (temp/max-tokens/top-p/stream), Arabic chat sample, live cost meter, sample prompts.
- **Keys.html** — API key list (scope, spend, status), create-key reveal, revoke, security notes.
- **Usage.html** — by-model + by-key breakdown bars, filterable jobs table, CSV export.
- **Wallet.html** — balance, top-up methods (mada/Apple Pay/bank/USDC), auto-top-up rules, transactions.
- **Invoices.html** — ZATCA simplified tax invoices, both billing entities, PDF/XML.
- **Settings.html** — workspace, billing entity, members + roles, notifications, danger zone.

### C · Provider console — `prototypes/provider/`
Shared chrome: `provider-shell.css` + `provider-shell.js` (**orange** accent). Sidebar: "earning today" status, nav (Operate: Dashboard/Rigs/Earnings/Payouts · Account: Profile/Settings), kill-switch in topbar.
- **Dashboard.html** — KPIs, 30D earnings chart, fleet status, recent jobs.
- **Rigs.html** — fleet table + filter, click-to-select per-rig detail drawer, re-pair command.
- **Earnings.html** — 90D chart, by-rig + by-model breakdown, weekly payouts table.
- **Payouts.html** — balance, manual withdraw, method selection, IBAN (SAMA Open Banking), schedule + threshold, tax/invoicing, payout history.
- **Profile.html** — tier ladder (Bronze→Silver→Gold→Platinum), identity, payout method.
- **Settings.html** — availability + kill switch, routing rules, notifications, danger zone.

### D · Provider onboarding wizard — `prototypes/Provider-Setup.html`
The flagship flow (`dcp.sa/setup`). 6 steps, midnight theme, orange accent, **left = action / right = reassurance** two-column layout. Persona: Saudi gamer/prosumer anxious about legitimacy, PC harm, real earnings, SAR payout, data safety.

1. **Sign in** — magic link (email + display name). Right rail: "why magic link is safer", live provider counter, trust chips. Designed **inbox/wait state**. "Providers earn — you never pay DCP."
2. **Requirements** — auto-detected compatibility checklist (OS/GPU/RAM/net) + honest "not supported" + isolated GPU-scoped container safety line.
3. **Your GPU** — auto-detected GPU card + rate slider (economy↔premium) + Bronze/Silver/Gold tier ladder.
4. **Earnings** (conversion moment) — interactive estimator: hours/day × days/week × demand → **SAR/month range** with transparent **75/25 split**. Honesty guardrails ("estimate, not a guarantee", tied to ~210 tok/sec). IBAN field + Moyasar/weekly-SAR payout mechanics, consent linking to Privacy.
5. **Install** — OS-detected download (Windows .msi 4MB / macOS .dmg / Linux) + pre-filled one-line installer + animated post-install sequence + cross-device QR/email handoff note.
6. **Verify** — live heartbeat **waiting state** → auto-flip to **"You're live and earning"** success state with "what now" checklist → dashboard link.

Cross-cutting: header عربي toggle (no blocking modal), full RTL, mobile-first, `aria-current` on stepper, reduced-motion, no earnings "guarantee", no cookie banner.

---

## Interactions & Behavior

- **Language toggle**: swaps all `data-en`/`data-ar`, sets `dir`. Production: i18next + logical CSS.
- **Wizard/stepper**: `go(n)` shows pane n, marks prior steps done (✓), sets `aria-current="step"`. Smooth-scroll to top.
- **Charts** (spend/earnings): inline SVG path generation from a data array; hover tooltip tracks nearest point; 7/30/90-day range toggle re-renders. Reimplement with the codebase's chart lib (Recharts/visx) or keep as lightweight SVG.
- **Earnings estimator**: `monthlyActive = hrs × days × 4.33`; `perHour = [1.15, 1.6, 2.2][demand]`; `mid = monthlyActive × perHour`; range = `mid × 0.78` → `mid × 1.24` (rounded to 10); split = 75% provider / 25% platform. **Always a range, never a guarantee.**
- **Magic-link / verify states**: designed loading (envelope bob / heartbeat pulse-ring) and success states. Verify auto-resolves after ~3.2s in the prototype — replace with a real poll.
- **Live counters**: provider count + mesh utilisation jitter on interval (cosmetic; replace with real data or remove).
- All animations gated behind `@media (prefers-reduced-motion: reduce)`.

## State Management
- **Language**: global (lang, dir) — app-level i18n provider.
- **Wizard**: current step (1–6), per-step form values (display name, email, GPU, rate, hours/days/demand, IBAN), magic-link sent flag, verify status (waiting/connected).
- **Console**: workspace selection, wallet balance, key list, usage/jobs (server data), chart range toggle, filters.
- **Data fetching**: all tables/charts/balances are mocked inline — wire to real endpoints (`api.dcp.sa/v1`, console/billing APIs).

## Assets
- `assets/dcp-kit.css` — full design-system stylesheet (tokens, components, RTL rules). Source of truth for tokens.
- `assets/dcp-logo-square.jpeg` — square logo (gradient ∞ on navy). For the inline wordmark, render text "DCP" + "∞" with the gradient via background-clip:text (see prototypes).
- Fonts: Google Fonts — Instrument Serif, Inter, JetBrains Mono, Noto Naskh Arabic.
- No icon library — prototypes use Unicode glyphs/mono characters. Production may swap in the codebase's icon set.

## Company facts (use verbatim; do not invent others)
- Legal entity: **DC Power Solutions Company**, Riyadh, KSA
- CR: **7053667775** · VAT: **311102233400003**
- Domains: `dcp.sa` · API `api.dcp.sa/v1` · console `console.dcp.sa` · SMB agents `agents.dcp.sa`
- Regions: RUH-1 (Riyadh) · JED-1 (Jeddah) · DMM-1 (Dammam) · NEOM-1
- Compliance to state: **PDPL**, Saudi data residency, **ZATCA** VAT. Do **not** claim ECC-1/CCC-1/NDMO/HSM or any cert not listed here.
- Payments: SAR (mada, Apple Pay, bank/SARIE, Moyasar for provider payouts), USDC on Base optional. Provider revenue share 75/25 at Silver.

## Files in this bundle
```
design_handoff_dcp_v2/
├── README.md                          ← this file
├── assets/
│   ├── dcp-kit.css                    ← design tokens + component CSS (source of truth)
│   └── dcp-logo-square.jpeg
└── prototypes/
    ├── Home.html                      ← marketing homepage
    ├── Auth.html                      ← sign in / create account
    ├── Setup.html                     ← renter onboarding wizard
    ├── Provider-Setup.html            ← provider onboarding wizard (6 steps) ★
    ├── Pricing.html / Demo.html / Sovereignty.html / Stage 1.html  ← earlier explorations (reference only)
    ├── docs/Docs.html + docs-shell.css
    ├── renter/  (Dashboard, Playground, Keys, Usage, Wallet, Invoices, Settings + renter-shell.css/js)
    └── provider/(Dashboard, Rigs, Earnings, Payouts, Profile, Settings + provider-shell.css/js)
```
Open any `.html` directly in a browser to see the intended design and behavior. Shared shell CSS/JS files show the sidebar/topbar structure each console reuses.
