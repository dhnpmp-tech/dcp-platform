'use client'

// Renders the v1 global overlays (cookie banner, language-preference modal,
// chat widget) on legacy v1 routes only. The redesigned surface (the app/(site)
// route group) now lives at CLEAN ROOT URLs (/, /docs, /agents, /renter/*, …)
// and carries its own chrome via app/(site)/layout.tsx — it must never show the
// v1 cookie banner / language modal / chat widget. Because the route group does
// not appear in the URL, this component identifies the redesigned routes by
// their canonical root path prefixes instead of a /v2 prefix.
import { usePathname } from 'next/navigation'
import CookieConsent from './CookieConsent'
import LanguagePreferenceModal from './LanguagePreferenceModal'
import ChatWidget from './ChatWidget'

// Exact public routes that are part of the redesign but render with v1 chrome
// suppressed (kept for routes whose suppression is path-exact, e.g. /status).
const V2_STYLED_ROUTES = ['/', '/status']

// Canonical root path prefixes owned by the redesigned app/(site) route group.
// Any pathname under one of these is a redesigned surface and must not show the
// v1 overlays. ('/' is handled as an exact match in V2_STYLED_ROUTES so it does
// not greedily match every path.)
const V2_ROUTE_PREFIXES = [
  '/docs',
  '/agents',
  '/containers',
  '/architecture',
  '/auth',
  '/setup',
  '/provider-setup',
  '/renter',
  '/provider',
  // Re-shelled legacy marketing/legal pages — now migrated into the app/(site)
  // route group, so they carry the new chrome and must never show the v1
  // cookie banner / language modal / chat widget.
  '/pricing',
  '/support',
  '/trust-center',
  '/earn',
  '/terms',
  '/privacy',
  '/acceptable-use',
  '/payment',
]

export default function V1GlobalChrome() {
  const pathname = usePathname()
  const isRedesignedRoute =
    !!pathname &&
    (V2_STYLED_ROUTES.includes(pathname) ||
      V2_ROUTE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      ))
  if (isRedesignedRoute) return null
  return (
    <>
      <CookieConsent />
      <LanguagePreferenceModal />
      <ChatWidget />
    </>
  )
}
