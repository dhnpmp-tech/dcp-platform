'use client'

// v2 i18n — mirrors the prototypes' data-en/data-ar pattern as a React context.
// Sets <html data-palette="midnight" data-lang dir lang> while a v2 route is
// mounted, and restores the prior attributes on unmount so v1 routes are
// untouched. Production note: this is intentionally lightweight; swap for the
// app's full i18next bundles when wiring real content.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveInitialLanguage } from '../../lib/detectLanguage'

type Lang = 'en' | 'ar'

// localStorage key persisting the user's MANUAL choice (header toggle). When
// present it overrides the browser default on subsequent visits.
const STORAGE_KEY = 'dcp_v2_lang'

interface V2Ctx {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (l: Lang) => void
  toggle: () => void
}

const Ctx = createContext<V2Ctx>({ lang: 'en', dir: 'ltr', setLang: () => {}, toggle: () => {} })

export function useV2(): V2Ctx {
  return useContext(Ctx)
}

export function V2Provider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr'

  // First-visit UX is browser-driven (NO language pop-up). On mount, take the
  // stored manual choice if present, else auto-detect from navigator.language.
  // SSR rendered the 'en' default; applying the resolved value here keeps the
  // server/client markup identical and avoids a hydration mismatch / flash.
  useEffect(() => {
    setLangState(resolveInitialLanguage(STORAGE_KEY))
  }, [])

  // apply Midnight palette on mount; restore originals on unmount
  useEffect(() => {
    const el = document.documentElement
    const orig = {
      palette: el.getAttribute('data-palette'),
      dir: el.getAttribute('dir'),
      lang: el.getAttribute('lang'),
      dataLang: el.getAttribute('data-lang'),
    }
    el.setAttribute('data-palette', 'midnight')
    return () => {
      if (orig.palette) el.setAttribute('data-palette', orig.palette)
      else el.removeAttribute('data-palette')
      el.setAttribute('dir', orig.dir || 'ltr')
      el.setAttribute('lang', orig.lang || 'en')
      if (orig.dataLang) el.setAttribute('data-lang', orig.dataLang)
      else el.removeAttribute('data-lang')
    }
  }, [])

  // keep lang/dir attributes in sync
  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-lang', lang)
    el.setAttribute('dir', dir)
    el.setAttribute('lang', lang)
  }, [lang, dir])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => setLang(lang === 'en' ? 'ar' : 'en'), [lang, setLang])

  return <Ctx.Provider value={{ lang, dir, setLang, toggle }}>{children}</Ctx.Provider>
}

// Bilingual leaf-text helper: <Bi en="Sign in" ar="دخول" />
export function Bi({ en, ar }: { en: string; ar: string }) {
  const { lang } = useV2()
  return <>{lang === 'ar' ? ar : en}</>
}

// Bilingual JSX helper. Server-renders BOTH variants; CSS shows the one
// matching html[data-lang]. Defaults to EN when no data-lang is set (pre-
// hydration / no-JS), so the hero headline lands in the initial HTML
// without waiting for the client i18n context — no hydration mismatch.
// Usage: <BiX en={<>by the <em>second.</em></>} ar={<>بالثانية.</>} />
export function BiX({ en, ar, as = 'span' }: { en: ReactNode; ar: ReactNode; as?: 'span' | 'div' }) {
  const Tag = as
  return (
    <Tag className="bix">
      <span className="bix-en">{en}</span>
      <span className="bix-ar" aria-hidden="true">{ar}</span>
    </Tag>
  )
}
