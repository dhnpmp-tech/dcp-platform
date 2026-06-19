'use client'

import Link from 'next/link'
import Image from 'next/image'
import Footer from './Footer'
import { useLanguage } from '../../lib/i18n'
import { ROUTES } from '../../lib/routes'

interface LegalPageProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  const { t, isRTL } = useLanguage()

  return (
    <div className="min-h-screen bg-dc1-void" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-dc1-surface-l1 border-b border-dc1-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/dcp-logo-primary.png" alt="DCP" width={96} height={32} className="h-8 w-auto" />
          </Link>
          <Link href={ROUTES.auth} className="text-sm text-dc1-amber hover:underline">{t('auth.sign_in')}</Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{title}</h1>
        <p className="text-sm text-dc1-text-muted mb-8">{t('legal.last_updated')}: {lastUpdated}</p>
        <div className="prose prose-invert max-w-none [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-dc1-text-primary [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:text-dc1-text-secondary [&_p]:leading-relaxed [&_p]:mb-4 [&_ul]:text-dc1-text-secondary [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-2 [&_a]:text-dc1-amber [&_a:hover]:underline [&_strong]:text-dc1-text-primary">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  )
}
