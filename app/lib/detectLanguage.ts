// Shared browser-language detection for the bilingual EN/AR UI.
//
// First-visit UX is browser-driven: there is NO language pop-up. Instead the
// initial language is resolved (client-side, on mount) from:
//   1. the user's previously-stored MANUAL choice (header toggle), if present;
//   2. otherwise navigator.language — "ar*" => Arabic, everything else => English.
//
// SSR always renders the `'en'` default to avoid a hydration mismatch; the
// detected/stored language is applied on mount.

export type Lang = 'en' | 'ar'

/**
 * Resolve the language for the very first visit from the browser locale.
 * Returns `'ar'` when navigator.language starts with "ar" (case-insensitive),
 * otherwise `'en'`. Safe to call on the server (returns `'en'`).
 */
export function detectBrowserLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const locales: ReadonlyArray<string> = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
  for (const locale of locales) {
    if (typeof locale === 'string' && locale.toLowerCase().startsWith('ar')) {
      return 'ar'
    }
  }
  return 'en'
}

/**
 * Read a stored manual choice (if valid), else fall back to browser detection.
 * `storageKey` is the localStorage key the surface persists its choice under.
 * Safe to call on the server (returns `'en'`).
 */
export function resolveInitialLanguage(storageKey: string): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'ar' || stored === 'en') return stored
  } catch {
    // Ignore storage access errors (private browsing, disabled storage).
  }
  return detectBrowserLanguage()
}
