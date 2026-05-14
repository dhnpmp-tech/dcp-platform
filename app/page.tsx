// DCP landing page — production /.
//
// P1 migration (2026-05-13): renders the Claude Design "Redesign" homepage
// (shared with /preview). The old role-intent + features-grid + launch
// banner landing has been replaced. See:
//   - docs/migration-preview-to-production.md (per-route diff + risk)
//   - app/preview/HomeRedesign.tsx (single source for the redesigned home)
//
// Intentional removals (call out in PR review):
//   - Role-intent toggle (renter/provider) and its analytics events
//   - LaunchBanner gated on online === 0 && registered >= 40
//   - ProviderCountWidget reading from usePublicMetricsContract()
//
// These belonged to the old hero. The redesigned hero has its own
// information architecture (animated Saudi node map, marketplace strip,
// playground demo, model grid). Reintroducing them is a follow-up.

import HomeRedesign from './preview/HomeRedesign'

export default function HomePage() {
  return <HomeRedesign />
}
