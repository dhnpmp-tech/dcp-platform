import crypto from 'node:crypto'

// __Host- prefix forces Secure + Path=/ + no Domain — strongest cookie scoping.
export const KEY_CIPHER_COOKIE = '__Host-dc1_kc'
export const SESSION_COOKIE = '__dc1_session'
// Sentinel returned by lib/api.ts getters post-migration. Never a real key.
export const KEY_SENTINEL = '__dc1_cookie_session__'

const ALG = 'aes-256-gcm'

function secret(): Buffer {
  const hex = process.env.DC1_KEY_CIPHER_SECRET
  if (!hex || hex.length < 32) {
    throw new Error('DC1_KEY_CIPHER_SECRET missing/short (need 32-byte hex)')
  }
  return crypto.createHash('sha256').update(hex).digest() // stable 32-byte key
}

/** Seals a raw key -> base64url(iv.tag.ciphertext). */
export function sealKey(raw: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALG, secret(), iv)
  const ct = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

/** Unseals; returns null on any tamper/format error (never throws to caller). */
export function unsealKey(sealed: string | undefined): string | null {
  if (!sealed) return null
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < 12 + 16 + 1) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const d = crypto.createDecipheriv(ALG, secret(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
