'use client'

// v2 i18n — mirrors the prototypes' data-en/data-ar pattern as a React context.
// Sets <html data-palette="midnight" data-lang dir lang> while a v2 route is
// mounted, and restores the prior attributes on unmount so v1 routes are
// untouched. Production note: this is intentionally lightweight; swap for the
// app's full i18next bundles when wiring real content.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Lang = 'en' | 'ar'

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

  // restore lang preference
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('dcp_v2_lang')
      if (saved === 'ar' || saved === 'en') setLangState(saved)
    } catch {
      /* ignore */
    }
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
      window.localStorage.setItem('dcp_v2_lang', l)
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
