'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguageToggle, useLanguage } from '../../lib/i18n'
import { persistRoleIntent, readRoleIntent, RoleIntent, trackRoleIntentApplied } from '../../lib/role-intent'
import { ROUTES } from '../../lib/routes'

interface PublicNavItem {
  label: string
  href: string
  matchPath?: string
}

export default function Header() {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [roleIntent, setRoleIntent] = useState<RoleIntent>('renter')
  const hasTrackedApply = useRef(false)

  useEffect(() => {
    const storedIntent = readRoleIntent()
    if (!storedIntent) return
    setRoleIntent(storedIntent)
    if (!hasTrackedApply.current) {
      trackRoleIntentApplied(storedIntent, { source: 'header', destination: 'navigation' })
      hasTrackedApply.current = true
    }
  }, [])

  const applyIntent = (nextIntent: RoleIntent) => {
    const previousIntent = roleIntent
    setRoleIntent(nextIntent)
    persistRoleIntent(nextIntent, {
      source: 'header_switcher',
      previousIntent,
      reason: previousIntent && previousIntent !== nextIntent ? 'overridden' : 'persisted',
    })
  }

  const docsHref =
    roleIntent === 'provider'
      ? '/docs/provider-guide#status-waiting-install-daemon'
      : '/docs/quickstart#renter-onboarding-checklist'
  const supportHref = '/support?category=enterprise&source=header-nav#contact-form'

  const publicNav: PublicNavItem[] = useMemo(
    () => [
      { label: t('header.nav.rent'), href: ROUTES.renterSignup },
      { label: t('header.nav.playground'), href: '/renter/playground?starter=1', matchPath: '/renter/playground' },
      { label: t('header.nav.container_api'), href: docsHref, matchPath: '/docs' },
      { label: t('header.nav.enterprise'), href: supportHref, matchPath: '/support' },
      { label: t('header.nav.earn'), href: ROUTES.providerSetup },
    ],
    [docsHref, supportHref, t]
  )

  const primaryHref =
    roleIntent === 'provider'
      ? ROUTES.providerSetup
      : roleIntent === 'enterprise'
        ? '/support?category=enterprise&source=header-primary-cta#contact-form'
        : ROUTES.renterSignup

  const primaryLabel =
    roleIntent === 'provider'
      ? t('header.primary_cta_provider')
      : roleIntent === 'enterprise'
        ? t('header.primary_cta_enterprise')
        : t('header.primary_cta_renter')

  const isActive = (item: PublicNavItem) => {
    const activePath = item.matchPath || item.href.split('?')[0]
    if (activePath === '/') return pathname === '/'
    return pathname.startsWith(activePath)
  }

  return (
    <header className="sticky top-0 z-50 bg-dc1-void/95 backdrop-blur-md border-b border-dc1-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/dcp-logo-primary.png"
              alt="DCP"
              width={36}
              height={36}
              className="h-20 w-auto"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {publicNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                  isActive(item)
                    ? 'text-dc1-amber bg-dc1-amber/10'
                    : 'text-dc1-text-secondary hover:text-dc1-text-primary hover:bg-dc1-surface-l2'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right side: Language toggle + Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-md border border-dc1-border bg-dc1-surface-l2 p-1">
              <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-dc1-text-muted">
                {t('header.intent.label')}
              </span>
              {(['renter', 'provider', 'enterprise'] as RoleIntent[]).map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => applyIntent(intent)}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                    roleIntent === intent
                      ? 'bg-dc1-amber text-dc1-void'
                      : 'text-dc1-text-secondary hover:text-dc1-text-primary'
                  }`}
                >
                  {t(`header.intent.${intent}`)}
                </button>
              ))}
            </div>
            <LanguageToggle />
            <Link href={ROUTES.auth} className="btn btn-secondary btn-sm">
              {t('header.console_login')}
            </Link>
            <Link href={primaryHref} className="btn btn-primary btn-sm">
              {primaryLabel}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-md text-dc1-text-secondary hover:text-dc1-text-primary hover:bg-dc1-surface-l2"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-dc1-border py-4 animate-fade-in">
            <nav className="flex flex-col gap-1">
              {publicNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-4 py-3 rounded-md text-sm font-medium ${
                    isActive(item)
                      ? 'text-dc1-amber bg-dc1-amber/10'
                      : 'text-dc1-text-secondary hover:text-dc1-text-primary hover:bg-dc1-surface-l2'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-dc1-border px-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-dc1-text-muted">
                {t('header.intent.label')}
              </p>
              <div className="flex gap-2">
                {(['renter', 'provider', 'enterprise'] as RoleIntent[]).map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    onClick={() => applyIntent(intent)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      roleIntent === intent
                        ? 'bg-dc1-amber text-dc1-void'
                        : 'border border-dc1-border text-dc1-text-secondary'
                    }`}
                  >
                    {t(`header.intent.${intent}`)}
                  </button>
                ))}
              </div>
              <LanguageToggle className="self-start" />
              <Link href={ROUTES.auth} className="btn btn-secondary text-center">{t('header.console_login')}</Link>
              <Link href={primaryHref} className="btn btn-primary text-center">{primaryLabel}</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
