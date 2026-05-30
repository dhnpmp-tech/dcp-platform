'use client'

// Renders the v1 global overlays (cookie banner, language-preference modal,
// chat widget) on v1 routes only. The v2 redesign (/v2/*) has its own chrome
// and must not show the v1 blocking modal / cookie banner.
import { usePathname } from 'next/navigation'
import CookieConsent from './CookieConsent'
import LanguagePreferenceModal from './LanguagePreferenceModal'
import ChatWidget from './ChatWidget'

export default function V1GlobalChrome() {
  const pathname = usePathname()
  if (pathname && pathname.startsWith('/v2')) return null
  return (
    <>
      <CookieConsent />
      <LanguagePreferenceModal />
      <ChatWidget />
    </>
  )
}
