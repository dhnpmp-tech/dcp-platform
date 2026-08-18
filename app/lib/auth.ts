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
  // Server validates this key before minting a signed session cookie.
  const apiKey = getStoredApiKey(metadata.role)
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: metadata.role, apiKey }),
  })
  if (typeof window !== 'undefined') {
    localStorage.setItem('dc1_user_data', JSON.stringify(metadata))
  }
}

/** Clears the session cookie, localStorage keys, and redirects to home. */
export async function clearSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' }).catch(() => {})
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
