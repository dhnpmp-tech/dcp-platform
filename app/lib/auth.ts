'use client'

export type AuthRole = 'provider' | 'renter' | 'admin'

const STORAGE_KEYS = {
  renter: 'dc1_renter_key',
  provider: 'dc1_provider_key',
  admin: 'dc1_admin_token',
  userData: 'dc1_user_data',
} as const

export interface SessionMetadata {
  role: AuthRole
  userName?: string
  email?: string
}

/** Sets the server-side httpOnly session cookie and updates localStorage user data. */
export async function setSession(metadata: SessionMetadata): Promise<void> {
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: metadata.role }),
  })
  if (typeof window !== 'undefined') {
    localStorage.setItem('dc1_user_data', JSON.stringify(metadata))
  }
}

/**
 * Seals the raw API key into the httpOnly __Host-dc1_kc cookie via
 * /api/auth/exchange AND mints the __dc1_session role cookie in one call.
 * Supersedes the /api/session-only mint. Returns false (without throwing) on
 * any failure so callers keep their existing localStorage dual-write path —
 * this is what makes the staged rollout safe and instantly rollback-able.
 */
export async function sealKeyExchange(role: AuthRole, key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, key }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Clears the session cookie, localStorage keys, and redirects to home. */
export async function clearSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' }).catch(() => {})
  // Also clear the sealed-key cookie minted by /api/auth/exchange.
  await fetch('/api/auth/exchange', { method: 'DELETE' }).catch(() => {})
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.renter)
    localStorage.removeItem(STORAGE_KEYS.provider)
    localStorage.removeItem(STORAGE_KEYS.admin)
    localStorage.removeItem(STORAGE_KEYS.userData)
  }
}

/** Returns the stored API key for a given role, or null if not present. */
export function getStoredApiKey(role: AuthRole): string | null {
  if (typeof window === 'undefined') return null
  const key = STORAGE_KEYS[role as keyof typeof STORAGE_KEYS]
  return localStorage.getItem(key as string) ?? null
}

/** Returns the stored user metadata from localStorage, or null. */
export function getStoredUserData(): SessionMetadata | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.userData)
    return raw ? (JSON.parse(raw) as SessionMetadata) : null
  } catch {
    return null
  }
}
