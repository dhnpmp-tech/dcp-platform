'use client'

// SiteShell — the unified NEW chrome wrapper. Drops the shared editorial-luxury
// header + footer around any page body so a re-shelled legacy page (pricing,
// support, terms, …) renders the SAME chrome as the redesigned home. The old v1
// Header/Footer/LegalPage imports are removed from those pages in favour of this.
//
// It lives in the app/(site) route group, so it automatically inherits
// dcp-kit.css + the Instrument Serif / Inter / JetBrains / Noto Naskh fonts +
// V2Provider from app/(site)/layout.tsx — no extra wiring needed per page.

import type { ReactNode } from 'react'
import SiteHeader from './SiteHeader'
import SiteFooter from './SiteFooter'
import './chrome.css'

interface SiteShellProps {
  children: ReactNode
  /** Active nav key (e.g. "/pricing") to underline the matching nav item. */
  active?: string
}

export default function SiteShell({ children, active }: SiteShellProps) {
  return (
    <div className="site-shell">
      <SiteHeader active={active} />
      {children}
      <SiteFooter />
    </div>
  )
}
