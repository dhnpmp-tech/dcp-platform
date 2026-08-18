'use client'

// Contact page — general "Contact us" surface. tak@dcp.sa is the primary
// contact address; specialised channels (support/billing/security/privacy)
// are listed below for routing. Wrapped in SiteShell for unified chrome.

import { Bi } from '@/app/(site)/lib/i18n'
import SiteShell from '@/app/(site)/components/chrome/SiteShell'

const CHANNELS: { key: string; en: string; ar: string; email: string }[] = [
  { key: 'support', en: 'Product & account support', ar: 'دعم المنتج والحساب', email: 'support@dcp.sa' },
  { key: 'billing', en: 'Billing & payments', ar: 'الفوترة والمدفوعات', email: 'billing@dcp.sa' },
  { key: 'security', en: 'Security & vulnerability reports', ar: 'الأمن والإبلاغ عن الثغرات', email: 'security@dcp.sa' },
  { key: 'privacy', en: 'Privacy & data requests', ar: 'الخصوصية وطلبات البيانات', email: 'privacy@dcp.sa' },
]

export default function ContactPage() {
  return (
    <SiteShell active="/contact">
      <main
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: 'clamp(48px, 8vw, 96px) 24px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--mut)',
            margin: 0,
          }}
        >
          <Bi en="Contact" ar="تواصل" />
        </p>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(34px, 6vw, 56px)',
            lineHeight: 1.05,
            letterSpacing: '-.02em',
            color: 'var(--ink)',
            margin: '10px 0 14px',
          }}
        >
          <Bi en="Talk to us" ar="تواصل معنا" />
        </h1>
        <p
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'clamp(16px, 2.4vw, 19px)',
            lineHeight: 1.6,
            color: 'var(--ink-2)',
            maxWidth: 560,
            margin: '0 0 40px',
          }}
        >
          <Bi
            en="Questions about GPU pods, inference, pricing, or partnerships — reach us directly and a person will get back to you."
            ar="أسئلة حول حاويات GPU أو الاستدلال أو الأسعار أو الشراكات — تواصل معنا مباشرةً وسيرد عليك أحد أفراد الفريق."
          />
        </p>

        {/* Primary contact */}
        <a
          href="mailto:tak@dcp.sa"
          dir="ltr"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '26px 28px',
            border: '1px solid color-mix(in oklab, var(--rt-accent) 40%, var(--hair))',
            background: 'color-mix(in oklab, var(--rt-accent) 8%, var(--paper))',
            borderRadius: 10,
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--mut)',
            }}
          >
            <Bi en="General enquiries" ar="الاستفسارات العامة" />
          </span>
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(24px, 4vw, 34px)',
              color: 'var(--rt-accent)',
              lineHeight: 1.1,
            }}
          >
            tak@dcp.sa
          </span>
        </a>

        {/* Specialised channels */}
        <div style={{ marginTop: 34, display: 'grid', gap: 0, border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
          {CHANNELS.map((c, i) => (
            <a
              key={c.key}
              href={`mailto:${c.email}`}
              dir="ltr"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '16px 22px',
                borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
                textDecoration: 'none',
                background: 'transparent',
              }}
            >
              <span style={{ fontFamily: 'var(--sans)', fontSize: 14.5, color: 'var(--ink)' }}>
                <Bi en={c.en} ar={c.ar} />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--rt-accent)' }}>{c.email}</span>
            </a>
          ))}
        </div>

        {/* Legal entity */}
        <p
          style={{
            marginTop: 34,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            letterSpacing: '.03em',
            lineHeight: 1.8,
            color: 'var(--mut)',
          }}
          dir="ltr"
        >
          DC Power Solutions Company · CR 7053667775
          <br />
          Riyadh, Kingdom of Saudi Arabia
        </p>
      </main>
    </SiteShell>
  )
}
