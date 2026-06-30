// Redesigned-site layout — Midnight design system, EN/AR + RTL.
// This is the layout for the app/(site) route group: the redesigned surface now
// serves from CLEAN ROOT URLs (/, /docs, /agents, /renter/*, /provider/*, …)
// — the "(site)" segment is a Next.js route group and never appears in the URL.
// dcp-kit.css is imported here so it is scoped to this group's routes (via the
// segment layout) and never leaks into the remaining legacy v1 pages.
import './styles/dcp-kit.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { V2Provider } from './lib/i18n'
import FunnelViewBeacon from './components/FunnelViewBeacon'

export const metadata: Metadata = {
  title: 'DCP · Sovereign Arabic AI Runtime · KSA',
  description: 'Arabic-first AI inference and agents, served from in-Kingdom GPUs, billed per token in Saudi Riyal.',
}

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Google Fonts — hoisted to <head> by Next. Matches dcp-kit.css font stacks. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap"
      />
      <V2Provider>
        <FunnelViewBeacon />
        {children}
      </V2Provider>
    </>
  )
}
