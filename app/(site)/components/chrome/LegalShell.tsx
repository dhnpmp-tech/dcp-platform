'use client'

// LegalShell — NEW editorial-luxury wrapper for legal documents (terms, privacy,
// acceptable-use). Replaces the OLD app/components/layout/LegalPage.tsx (which
// rendered its own legacy-palette surface header + amber links + old Footer).
// Same { title, lastUpdated, children } API so each legal page only swaps its import.
//
// Lives in app/(site), so it inherits dcp-kit.css tokens + new fonts + V2Provider
// from the group layout. Wraps the legal body in SiteShell for unified chrome.

import type { ReactNode } from 'react'
import SiteShell from './SiteShell'
import './legal.css'

interface LegalShellProps {
  title: string
  lastUpdated: string
  children: ReactNode
}

export default function LegalShell({ title, lastUpdated, children }: LegalShellProps) {
  return (
    <SiteShell>
      <article className="legal-doc">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {lastUpdated}</p>
        <div className="legal-body">{children}</div>
      </article>
    </SiteShell>
  )
}
