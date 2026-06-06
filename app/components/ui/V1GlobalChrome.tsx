'use client'

// Renders the v1 global overlays (cookie banner, language-preference modal,
// chat widget) on v1 routes only. The v2 redesign (/v2/*) has its own chrome
// and must not show the v1 blocking modal / cookie banner.
import { usePathname } from 'next/navigation'
import CookieConsent from './CookieConsent'
import LanguagePreferenceModal from './LanguagePreferenceModal'
import ChatWidget from './ChatWidget'

// Public routes rewritten in the v2 design language but living outside the
// /v2 tree (their canonical paths are linked from the landing/footer/email).
// They must not show the v1 cookie banner / language modal / chat widget.
const V2_STYLED_ROUTES = ['/status']

export default function V1GlobalChrome() {
  const pathname = usePathname()
  if (pathname && (pathname.startsWith('/v2') || V2_STYLED_ROUTES.includes(pathname))) return null
  return (
    <>
      <CookieConsent />
      <LanguagePreferenceModal />
      <ChatWidget />
    </>
  )
}
