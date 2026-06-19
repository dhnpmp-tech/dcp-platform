'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '../../lib/i18n'
import { ROUTES } from '../../lib/routes'

export default function Footer() {
  const { t } = useLanguage()

  return (
    <footer className="bg-dc1-surface-l1 border-t border-dc1-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center mb-4">
              <Image
                src="/dcp-logo-primary.png"
                alt="DCP"
                width={64}
                height={64}
                className="h-16 w-16 object-contain rounded-xl"
              />
            </div>
            <p className="text-sm text-dc1-text-secondary leading-relaxed">
              {t('footer.brand_description')}
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-sm font-semibold text-dc1-text-primary mb-4">{t('footer.platform')}</h4>
            <ul className="space-y-2">
              <li><Link href={ROUTES.renterSignup} className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.rent_gpus')}</Link></li>
              <li><Link href={ROUTES.providerSetup} className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.earn_with_gpus')}</Link></li>
              <li><Link href="/marketplace" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.marketplace')}</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-dc1-text-primary mb-4">{t('footer.resources')}</h4>
            <ul className="space-y-2">
              <li><Link href={ROUTES.docs} className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.docs')}</Link></li>
              <li><Link href={ROUTES.docs} className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.api_reference')}</Link></li>
              <li><Link href="/support?source=footer-support" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.support')}</Link></li>
              <li><Link href="/support?category=provider&source=footer-support-provider#contact-form" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.support_provider_install')}</Link></li>
              <li><Link href="/support?category=bug&source=footer-support-job#contact-form" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.support_job_issue')}</Link></li>
              <li><Link href="/support?category=billing&source=footer-support-billing#contact-form" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.support_billing')}</Link></li>
              <li><Link href="/support?category=enterprise&source=footer-support-enterprise#contact-form" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.support_enterprise')}</Link></li>
              <li><Link href={ROUTES.auth} className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.console_login')}</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-dc1-text-primary mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2">
              <li><Link href="/terms" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.terms')}</Link></li>
              <li><Link href="/privacy" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.privacy')}</Link></li>
              <li><Link href="/acceptable-use" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.acceptable_use')}</Link></li>
              <li><Link href="/status" className="text-sm text-dc1-text-secondary hover:text-dc1-amber transition-colors">{t('footer.system_status')}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-dc1-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-dc1-text-muted">
            &copy; {new Date().getFullYear()} {t('footer.company_legal')}
          </p>
          <p className="text-xs text-dc1-text-muted">
            dcp.sa
          </p>
        </div>
      </div>
    </footer>
  )
}
