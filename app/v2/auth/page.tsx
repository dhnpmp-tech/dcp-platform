'use client'

// Ported from prototypes/Auth.html — Midnight design system, EN/AR + RTL.
// Tab switch (sign in / create account) is reimplemented as React state; the
// prototype's `?new` deep-link maps to a useSearchParams check below.
import './auth.css'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Bi, useV2 } from '@/app/v2/lib/i18n'

type AuthTab = 'signin' | 'signup'

function AuthInner() {
  const { lang, toggle } = useV2()
  const search = useSearchParams()
  // open on signup if ?new (mirrors location.search.includes('new'))
  const initialTab: AuthTab = search?.has('new') ? 'signup' : 'signin'
  const [tab, setTab] = useState<AuthTab>(initialTab)

  return (
    <div className="auth">
      {/* Brand panel */}
      <div className="auth-brand">
        <Link href="/v2/home" className="wm" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          DCP<i>∞</i>
        </Link>
        <div className="glyph" aria-hidden="true">
          <svg viewBox="0 0 1200 700">
            <g className="ms" transform="translate(180 110)">
              <path d="M 0 0 H 180 V 60 H 60 V 220 H 180 V 280 H 0 Z" />
              <path d="M 260 0 H 460 V 60 H 320 V 160 H 460 V 220 H 380 V 280 H 260 Z M 380 100 H 460 V 160 H 380 Z" />
              <path d="M 540 0 H 720 V 60 H 600 V 220 H 720 V 280 H 540 Z M 660 100 H 720 V 160 H 660 Z" />
            </g>
          </svg>
        </div>
        <div className="big">
          <Bi en="Arabic AI that " ar="ذكاء اصطناعي عربي " />
          <em>
            <Bi en="lives in the Kingdom." ar="يعيش داخل المملكة." />
          </em>
        </div>
        <div className="foot">
          <span>
            <Bi en="Inference · agents" ar="استدلال · وكلاء" />
          </span>
          <span>
            <Bi en="Pay in Riyal" ar="ادفع بالريال" />
          </span>
          <span>
            <Bi en="PDPL · in-Kingdom" ar="نظام حماية البيانات · داخل المملكة" />
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="auth-form">
        {/* Language toggle chrome */}
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle language"
          style={{
            alignSelf: 'flex-end',
            display: 'inline-flex',
            border: '1px solid var(--hair)',
            borderRadius: 2,
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.1em',
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          <span style={{ padding: '5px 9px', background: lang === 'en' ? 'var(--ink)' : 'transparent', color: lang === 'en' ? 'var(--bg)' : 'var(--ink)' }}>EN</span>
          <span style={{ padding: '5px 9px', background: lang === 'ar' ? 'var(--ink)' : 'transparent', color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)' }}>ع</span>
        </button>

        <div className="seg-tabs" id="tabs" role="tablist">
          <button
            data-t="signin"
            className={tab === 'signin' ? 'on' : undefined}
            role="tab"
            aria-selected={tab === 'signin'}
            onClick={() => setTab('signin')}
          >
            <Bi en="Sign in" ar="تسجيل الدخول" />
          </button>
          <button
            data-t="signup"
            className={tab === 'signup' ? 'on' : undefined}
            role="tab"
            aria-selected={tab === 'signup'}
            onClick={() => setTab('signup')}
          >
            <Bi en="Create account" ar="إنشاء حساب" />
          </button>
        </div>

        <div id="pane-signin" style={{ display: tab === 'signin' ? 'block' : 'none' }}>
          <h1>
            <Bi en="Welcome back." ar="مرحباً بعودتك." />
          </h1>
          <p className="sub">
            <Bi en="Sign in to your DCP console." ar="سجّل الدخول إلى لوحة تحكم DCP." />
          </p>

          <div className="oauth">
            <button>
              <span className="ic">⚷</span> <Bi en="Continue with Nafath" ar="المتابعة عبر نفاذ" />
            </button>
            <button>
              <span className="ic">✉</span> <Bi en="Continue with Google" ar="المتابعة عبر جوجل" />
            </button>
          </div>
          <div className="divider">
            <Bi en="or with email" ar="أو عبر البريد الإلكتروني" />
          </div>

          <div className="field">
            <label>
              <Bi en="Email" ar="البريد الإلكتروني" />
            </label>
            <input type="email" defaultValue="fatima@nextwave.sa" />
          </div>
          <div className="field">
            <label>
              <Bi en="Password" ar="كلمة المرور" />
            </label>
            <input type="password" defaultValue="············" />
          </div>
          <Link
            href="/v2/renter/dashboard"
            className="btn-pri"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: 1.2 }}
          >
            <Bi en="Sign in →" ar="تسجيل الدخول ←" />
          </Link>

          <div className="legal">
            <Bi en="Forgot your password? " ar="هل نسيت كلمة المرور؟ " />
            <a href="#">
              <Bi en="Reset it" ar="إعادة تعيينها" />
            </a>
            .
          </div>
        </div>

        <div id="pane-signup" style={{ display: tab === 'signup' ? 'block' : 'none' }}>
          <h1>
            <Bi en="Start free." ar="ابدأ مجاناً." />
          </h1>
          <p className="sub">
            <Bi
              en="No card required. Your first SAR 20 of inference is on us."
              ar="لا حاجة لبطاقة. أول 20 ريالاً من الاستدلال على حسابنا."
            />
          </p>

          <div className="oauth">
            <button>
              <span className="ic">⚷</span> <Bi en="Continue with Nafath" ar="المتابعة عبر نفاذ" />
            </button>
            <button>
              <span className="ic">✉</span> <Bi en="Continue with Google" ar="المتابعة عبر جوجل" />
            </button>
          </div>
          <div className="divider">
            <Bi en="or with email" ar="أو عبر البريد الإلكتروني" />
          </div>

          <div className="field">
            <label>
              <Bi en="Work email" ar="بريد العمل" />
            </label>
            <input type="email" placeholder={lang === 'ar' ? 'you@company.sa' : 'you@company.sa'} />
          </div>
          <div className="field">
            <label>
              <Bi en="Password" ar="كلمة المرور" />
            </label>
            <input
              type="password"
              placeholder={lang === 'ar' ? 'اختر كلمة مرور قوية' : 'Choose a strong password'}
            />
          </div>
          <Link
            href="/v2/setup"
            className="btn-pri"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: 1.2 }}
          >
            <Bi en="Create account →" ar="إنشاء حساب ←" />
          </Link>

          <div className="legal">
            <Bi en="By continuing you agree to our " ar="بالمتابعة فإنك توافق على " />
            <Link href="/v2/terms">
              <Bi en="Terms" ar="الشروط" />
            </Link>
            <Bi en=" and " ar=" و" />
            <Link href="/v2/privacy">
              <Bi en="Privacy Policy" ar="سياسة الخصوصية" />
            </Link>
            <Bi
              en=". Data stays in the Kingdom per PDPL."
              ar=". تبقى البيانات داخل المملكة وفق نظام حماية البيانات الشخصية."
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  )
}
