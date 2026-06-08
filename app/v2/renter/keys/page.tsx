'use client'

// Ported from the v2 renter console source design (API keys).
// Sidebar + topbar chrome (formerly injected by renter-shell.js) is inlined here so the
// route is self-contained; renter-shell.css is folded into ./keys.css.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase, getRenterKey } from '@/lib/api'
import './keys.css'

// ── Nav model (from renter-shell.js NAV) ───────────────────────────────
const NAV = [
  {
    sec: 'Build',
    secAr: 'البناء',
    items: [
      { k: 'dash', ic: '⌂', label: 'Overview', labelAr: 'نظرة عامة', href: '/v2/renter/dashboard' },
      { k: 'pg', ic: '▷', label: 'Playground', labelAr: 'البيئة التجريبية', href: '/v2/renter/playground' },
      { k: 'keys', ic: '⚷', label: 'API keys', labelAr: 'مفاتيح API', href: '/v2/renter/keys' },
      { k: 'usage', ic: '△', label: 'Usage', labelAr: 'الاستخدام', href: '/v2/renter/usage' },
      { k: 'pods', ic: '▦', label: 'GPU Pods', labelAr: 'حاويات GPU', href: '/v2/renter/pods' },
    ],
  },
  {
    sec: 'Spend',
    secAr: 'الإنفاق',
    items: [
      { k: 'wallet', ic: '₪', label: 'Wallet', labelAr: 'المحفظة', href: '/v2/renter/wallet', bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices', labelAr: 'الفواتير', href: '/v2/renter/invoices' },
    ],
  },
  {
    sec: 'Account',
    secAr: 'الحساب',
    items: [
      { k: 'settings', ic: '⚙', label: 'Settings', labelAr: 'الإعدادات', href: '/v2/renter/settings' },
      { k: 'docs', ic: '?', label: 'Docs', labelAr: 'التوثيق', href: '/v2/docs', bd: '↗' },
    ],
  },
]

const CURRENT_PAGE = 'keys'

interface KeyRow {
  id?: string
  name: string
  prefix: string
  scope: 'full' | 'read' | 'none'
  scopeLabel: string
  scopeLabelAr: string
  created: string
  createdAr: string
  lastUsed: string
  lastUsedAr: string
  spend: string
  status: 'active' | 'revoked'
  statusLabel: string
  statusLabelAr: string
  revoked?: boolean
}

// ── Live API shape (GET /api/renters/me/keys → { keys: [...] }) ─────────
interface ApiKey {
  id: string
  label: string | null
  scopes: string[]
  org_id?: string | null
  org_role?: string | null
  expires_at?: string | null
  last_used_at?: string | null
  created_at?: string | null
  revoked?: boolean
}

interface KeysResponse {
  keys?: ApiKey[]
}

interface RenterMe {
  renter?: {
    name?: string
    organization?: string
    balance_halala?: number
    total_spent_halala?: number
  }
}

type LoadState = 'loading' | 'ready' | 'missing-key' | 'error'

interface CreateKeyResponse extends ApiKey {
  key?: string
}

// Format an ISO timestamp into a short, locale-aware date string. The list
// endpoint doesn't return per-key 30d spend, so that column keeps its em-dash.
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Derive the existing scope-pill style from the backend scopes array.
// admin/billing → write-capable (full); inference-only → read.
function deriveScope(scopes: string[], revoked: boolean): Pick<KeyRow, 'scope' | 'scopeLabel' | 'scopeLabelAr'> {
  if (revoked) return { scope: 'none', scopeLabel: '—', scopeLabelAr: '—' }
  const label = scopes.join(' · ') || 'inference'
  if (scopes.includes('admin') || scopes.includes('billing')) {
    return { scope: 'full', scopeLabel: `Full · ${label}`, scopeLabelAr: `كامل · ${label}` }
  }
  return { scope: 'read', scopeLabel: `Read · ${label}`, scopeLabelAr: `قراءة · ${label}` }
}

// Map a live API key into the row shape the table already renders. Fetched
// (runtime) strings fill both en/ar so the existing <Bi> markup is unchanged.
function toRow(k: ApiKey): KeyRow {
  const revoked = Boolean(k.revoked)
  const name = (k.label && k.label.trim()) || `key-${k.id.slice(0, 8)}`
  const created = fmtDate(k.created_at)
  const lastUsed = k.last_used_at ? fmtDate(k.last_used_at) : 'Never'
  const lastUsedAr = k.last_used_at ? fmtDate(k.last_used_at) : 'لم يُستخدم'
  return {
    id: k.id,
    name,
    prefix: `dc1-sk-${k.id.slice(0, 4)}…${k.id.slice(-4)}`,
    ...deriveScope(Array.isArray(k.scopes) ? k.scopes : [], revoked),
    created,
    createdAr: created,
    lastUsed,
    lastUsedAr,
    spend: '—',
    status: revoked ? 'revoked' : 'active',
    statusLabel: revoked ? 'Revoked' : 'Active',
    statusLabelAr: revoked ? 'ملغى' : 'نشط',
    revoked,
  }
}

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const halToSar = (h: number) => h / 100

export default function RenterKeysPage() {
  const { lang, toggle } = useV2()

  const [navOpen, setNavOpen] = useState(false)
  const [rows, setRows] = useState<KeyRow[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [renterName, setRenterName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [balanceSar, setBalanceSar] = useState<number | null>(null)
  const [totalSpentSar, setTotalSpentSar] = useState<number | null>(null)
  const [showNewCard, setShowNewCard] = useState(false)
  const [newLabel, setNewLabel] = useState('production-server')
  const [newScopes, setNewScopes] = useState<string[]>(['inference'])
  const [newKeySecret, setNewKeySecret] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const newCardRef = useRef<HTMLDivElement | null>(null)

  const getStoredKey = () => (typeof window === 'undefined' ? null : getRenterKey())

  // Reveal the new-key card, then scroll it into view (matches prototype's
  // #new-key click handler). Honour reduced-motion: skip the smooth scroll.
  useEffect(() => {
    if (!showNewCard || !newCardRef.current) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    newCardRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
  }, [showNewCard])

  const loadKeys = useCallback(async () => {
    const key = getStoredKey()
    if (!key) {
      setLoadState('missing-key')
      setRows([])
      return
    }

    setLoadState('loading')
    setError('')
    try {
      const base = getApiBase()
      const headers = { 'x-renter-key': key }
      const [meRes, res] = await Promise.all([
        fetch(`${base}/renters/me?key=${encodeURIComponent(key)}`, { headers }),
        fetch(`${base}/renters/me/keys`, { headers }),
      ])
      if (meRes.ok) {
        const me = (await meRes.json().catch(() => ({}))) as RenterMe
        const renter = me.renter
        setRenterName(renter?.name || '')
        setWorkspaceName(renter?.organization || '')
        setBalanceSar(typeof renter?.balance_halala === 'number' ? halToSar(renter.balance_halala) : null)
        setTotalSpentSar(typeof renter?.total_spent_halala === 'number' ? halToSar(renter.total_spent_halala) : null)
      }
      const data: KeysResponse & { error?: string } = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load API keys.')
      setRows(Array.isArray(data.keys) ? data.keys.map(toRow) : [])
      setLoadState('ready')
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Failed to load API keys.')
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const activeCount = rows.filter((r) => r.status === 'active').length
  const revokedCount = rows.filter((r) => r.status === 'revoked').length
  const displayName = renterName || (lang === 'ar' ? 'المستأجر' : 'Renter')
  const displayWorkspace = workspaceName || (lang === 'ar' ? 'مساحة العمل' : 'Workspace')

  const handleCopy = () => {
    try {
      if (newKeySecret) void navigator.clipboard?.writeText(newKeySecret)
    } catch {
      /* clipboard unavailable in this context */
    }
    setCopied(true)
  }

  const toggleScope = (scope: string) => {
    setNewScopes((prev) => {
      if (prev.includes(scope)) {
        const next = prev.filter((s) => s !== scope)
        return next.length ? next : ['inference']
      }
      return [...prev, scope]
    })
  }

  const createKey = async () => {
    const key = getStoredKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    setIsCreating(true)
    setError('')
    setNewKeySecret('')
    setCopied(false)
    try {
      const res = await fetch(`${getApiBase()}/renters/me/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': key,
        },
        body: JSON.stringify({
          label: newLabel.trim() || undefined,
          scopes: newScopes,
        }),
      })
      const data: CreateKeyResponse & { error?: string } = await res.json().catch(() => ({}))
      if (!res.ok || !data.key) throw new Error(data.error || 'Failed to create API key.')
      setNewKeySecret(data.key)
      await loadKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key.')
    } finally {
      setIsCreating(false)
    }
  }

  const revokeKey = async (id: string | undefined) => {
    if (!id) return
    const key = getStoredKey()
    if (!key) {
      setLoadState('missing-key')
      return
    }
    setRevokingId(id)
    setError('')
    try {
      const res = await fetch(`${getApiBase()}/renters/me/keys/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { 'x-renter-key': key },
      })
      const data: { error?: string } = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to revoke API key.')
      await loadKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="rt-app">
      {/* ── Sidebar (inlined from renter-shell.js) ─────────────────── */}
      <aside className={`rt-sb${navOpen ? ' on' : ''}`} id="rt-sb" data-page="keys">
        <div className="rt-sb-brand">
          <span className="wm">
            DCP<i>∞</i>
          </span>
          <span className="ctx">
            <Bi en="Console" ar="لوحة التحكم" />
          </span>
        </div>

        <div className="rt-ws">
          <button className="rt-ws-btn" title="Switch workspace" type="button">
            <span className="av">N</span>
            <span className="body">
              <span className="nm">{displayWorkspace}</span>
              <span className="sub">
                <Bi en="Live renter account" ar="حساب مستأجر حي" />
              </span>
            </span>
            <span className="chev">⌄</span>
          </button>
        </div>

        <div className="rt-wallet">
          <div className="k">
            <Bi en="Balance" ar="الرصيد" />
          </div>
          <div className="v">
            {balanceSar != null ? (
              <>
                SAR {numFmt.format(Math.floor(balanceSar))}
                <span className="u">.{(balanceSar % 1).toFixed(2).slice(2)}</span>
              </>
            ) : (
              <span className="u">—</span>
            )}
          </div>
          <div className="row">
            <span>
              <Bi en="Held in active jobs" ar="محجوز في مهام نشطة" />
            </span>
            <b>—</b>
          </div>
          <div className="row">
            <span>
              <Bi en="Burn · last 7 days" ar="الصرف · آخر ٧ أيام" />
            </span>
            <b>{totalSpentSar != null ? `SAR ${totalSpentSar.toFixed(2)}` : '—'}</b>
          </div>
          <button className="topup" type="button">
            <Bi en="+ Top up" ar="+ شحن الرصيد" />
          </button>
        </div>

        <nav className="rt-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sec">
                <Bi en={s.sec} ar={s.secAr} />
              </div>
              {s.items.map((it) => {
                const active = it.k === CURRENT_PAGE
                return (
                  <Link
                    key={it.k}
                    href={it.href}
                    className={active ? 'on' : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="ic">{it.ic}</span>
                    <span>
                      <Bi en={it.label} ar={it.labelAr} />
                    </span>
                    <span className="bd">{it.k === 'keys' ? String(activeCount) : (it.bd || '')}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="rt-sb-foot">
          <div className="av">F</div>
          <div className="who">
            {displayName}
            <span className="e">
              <Bi en="Renter workspace" ar="مساحة عمل المستأجر" />
            </span>
          </div>
          <span className="out" title="Sign out" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { localStorage.removeItem('dc1_renter_key'); window.location.href = '/v2/auth' }}>
            ↱
          </span>
        </div>
      </aside>

      <div
        className={`rt-backdrop${navOpen ? ' on' : ''}`}
        id="rt-backdrop"
        onClick={() => setNavOpen(false)}
      />

      <div>
        {/* ── Topbar (inlined from renter-shell.js) ────────────────── */}
        <header className="rt-tb" id="rt-tb" data-crumb="API keys">
          <button
            className="mb-toggle"
            id="mb-toggle"
            aria-label="Menu"
            type="button"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>{displayWorkspace}</span>
            <span className="sep">/</span>
            <span className="cur">
              <Bi en="API keys" ar="مفاتيح API" />
            </span>
          </div>
          <span className="pill">
            <span className="d" /> <Bi en="API live" ar="الواجهة تعمل" />
          </span>
          <button className="lang-pill" type="button" onClick={toggle} aria-label="Toggle language">
            <span
              style={{
                background: lang === 'en' ? 'var(--ink)' : 'transparent',
                color: lang === 'en' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              EN
            </span>
            <span
              style={{
                background: lang === 'ar' ? 'var(--ink)' : 'transparent',
                color: lang === 'ar' ? 'var(--bg)' : 'var(--ink)',
              }}
            >
              ع
            </span>
          </button>
          <Link className="keys" href="/v2/renter/keys">
            ⚷ <Bi en="API keys" ar="مفاتيح API" />
          </Link>
        </header>

        <main className="rt-main">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 className="rt-h1">
                <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
                  <Bi en="Keys" ar="المفاتيح" />
                </em>{' '}
                <Bi en="& access." ar="والوصول." />
              </h1>
              <div className="rt-h1-sub">
                <span>
                  <b>{activeCount}</b> <Bi en="active keys" ar="مفاتيح نشطة" />
                </span>
                <span>
                  <b>{revokedCount}</b> <Bi en="revoked" ar="ملغى" />
                </span>
                <span>
                  <Bi en="Real scoped keys only" ar="مفاتيح حقيقية محددة النطاق فقط" />
                </span>
              </div>
            </div>
            <button className="btn-pri" id="new-key" type="button" onClick={() => { setShowNewCard(true); setNewKeySecret(''); setCopied(false) }}>
              <Bi en="+ Create a new key" ar="+ إنشاء مفتاح جديد" />
            </button>
          </div>

          {loadState === 'missing-key' && (
            <div className="state-card err" style={{ marginTop: 30 }}>
              <Bi
                en="Sign in with a renter API key before managing scoped keys."
                ar="سجّل الدخول بمفتاح مستأجر قبل إدارة المفاتيح محددة النطاق."
              />{' '}
              <Link href="/v2/auth?role=renter&method=apikey&redirect=/v2/renter/keys">
                <Bi en="Sign in" ar="تسجيل الدخول" />
              </Link>
            </div>
          )}
          {error && (
            <div className="state-card err" style={{ marginTop: 30 }} role="alert">
              {error}
            </div>
          )}

          {/* New key */}
          <div
            className="new-key-card"
            style={{ marginTop: 30, display: showNewCard ? 'block' : 'none' }}
            id="new-card"
            ref={newCardRef}
          >
            <h3
              style={{
                fontFamily: 'var(--serif)',
                fontWeight: 400,
                fontSize: 22,
                letterSpacing: '-.01em',
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              <Bi en="Your new key" ar="مفتاحك الجديد" />
            </h3>
            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--ink-2)',
                fontSize: 14,
                lineHeight: 1.55,
                maxWidth: '60ch',
              }}
            >
              <Bi
                en="Choose the scopes, create the key, then copy it immediately. DCP only returns the full secret once."
                ar="اختر النطاقات، أنشئ المفتاح، ثم انسخه فوراً. يعيد DCP السر الكامل مرة واحدة فقط."
              />
            </p>
            <div className="create-grid">
              <label>
                <Bi en="Label" ar="التسمية" />
                <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="production-server" />
              </label>
              <div className="scope-checks">
                {['inference', 'billing', 'admin'].map((scope) => (
                  <label key={scope}>
                    <input type="checkbox" checked={newScopes.includes(scope)} onChange={() => toggleScope(scope)} />
                    {scope}
                  </label>
                ))}
              </div>
              <button className="btn-pri" type="button" onClick={createKey} disabled={isCreating || loadState === 'missing-key'}>
                {isCreating ? <Bi en="Creating…" ar="جارٍ الإنشاء…" /> : <Bi en="Create key" ar="إنشاء المفتاح" />}
              </button>
            </div>
            {newKeySecret && (
              <div className="reveal-row">
                <code>{newKeySecret}</code>
                <button className="copy" type="button" onClick={handleCopy}>
                  {copied ? <Bi en="Copied" ar="تم النسخ" /> : <Bi en="Copy" ar="نسخ" />}
                </button>
              </div>
            )}
          </div>

          {/* Existing keys */}
          <div className="panel" style={{ marginTop: 30 }}>
            <div className="panel-hd">
              <div>
                <h3>
                  <Bi en="Existing keys" ar="المفاتيح الحالية" />
                </h3>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10.5px',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--mut)',
                }}
              >
                <Bi en="Workspace:" ar="مساحة العمل:" />{' '}
                <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{displayWorkspace}</b>
              </span>
            </div>
            <table className="tbl keys-tbl">
              <thead>
                <tr>
                  <th>
                    <Bi en="Name" ar="الاسم" />
                  </th>
                  <th>
                    <Bi en="Scope" ar="النطاق" />
                  </th>
                  <th>
                    <Bi en="Created" ar="أُنشئ" />
                  </th>
                  <th>
                    <Bi en="Last used" ar="آخر استخدام" />
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    <Bi en="Spend · 30d" ar="الإنفاق · ٣٠ يوم" />
                  </th>
                  <th>
                    <Bi en="Status" ar="الحالة" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadState === 'loading' && (
                  <tr>
                    <td colSpan={7}>
                      <span className="mut">
                        <Bi en="Loading keys…" ar="جارٍ تحميل المفاتيح…" />
                      </span>
                    </td>
                  </tr>
                )}
                {loadState === 'ready' && rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <span className="mut">
                        <Bi en="No scoped keys yet. Create one to use outside the master renter key." ar="لا توجد مفاتيح محددة النطاق بعد. أنشئ مفتاحاً لاستخدامه بدلاً من مفتاح المستأجر الرئيسي." />
                      </span>
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id ?? row.name} style={row.revoked ? { opacity: 0.5 } : undefined}>
                    <td>
                      <span className="nm">{row.name}</span>
                      <span className="prefix">{row.prefix}</span>
                    </td>
                    <td>
                      <span className={`scope-pill${row.scope === 'full' ? ' full' : row.scope === 'read' ? ' read' : ''}`}>
                        <Bi en={row.scopeLabel} ar={row.scopeLabelAr} />
                      </span>
                    </td>
                    <td>
                      <span className="mut">
                        <Bi en={row.created} ar={row.createdAr} />
                      </span>
                    </td>
                    <td>
                      <span className="mut">
                        <Bi en={row.lastUsed} ar={row.lastUsedAr} />
                      </span>
                    </td>
                    <td>
                      <span className="sar">
                        {row.spend}
                        <span className="u">SAR</span>
                      </span>
                    </td>
                    <td>
                      <span className={`stat ${row.status}`}>
                        <Bi en={row.statusLabel} ar={row.statusLabelAr} />
                      </span>
                    </td>
                    <td className="actions">
                      {row.revoked ? (
                        <span className="mut">—</span>
                      ) : (
                        <>
                          <button className="danger" type="button" disabled={revokingId === row.id} onClick={() => void revokeKey(row.id)}>
                            {revokingId === row.id ? <Bi en="Revoking…" ar="جارٍ الإلغاء…" /> : <Bi en="Revoke" ar="إلغاء" />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Security tips */}
          <div
            style={{
              marginTop: 28,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 22,
            }}
          >
            <div className="panel">
              <h3
                style={{
                  fontFamily: 'var(--serif)',
                  fontWeight: 400,
                  fontSize: 22,
                  letterSpacing: '-.01em',
                  margin: '0 0 10px',
                }}
              >
                <Bi en="Use the right key for the job" ar="استخدم المفتاح المناسب لكل مهمة" />
              </h3>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.65 }}>
                <Bi
                  en="One key per service — production server, staging, CI runner. If a key leaks, you can revoke just that one without breaking the rest of your fleet. Read-only keys are great for dashboards and analytics jobs that shouldn’t be able to spend money."
                  ar="مفتاح واحد لكل خدمة — خادم الإنتاج، البيئة التجريبية، مشغّل CI. إذا تسرّب مفتاح، يمكنك إلغاء ذلك المفتاح وحده دون تعطيل بقية أنظمتك. المفاتيح للقراءة فقط مثالية للوحات المعلومات ومهام التحليلات التي لا ينبغي أن تنفق أموالاً."
                />
              </p>
            </div>
            <div className="panel">
              <h3
                style={{
                  fontFamily: 'var(--serif)',
                  fontWeight: 400,
                  fontSize: 22,
                  letterSpacing: '-.01em',
                  margin: '0 0 10px',
                }}
              >
                <Bi en="Set spend limits per key" ar="حدّد سقف الإنفاق لكل مفتاح" />
              </h3>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.65 }}>
                <Bi
                  en="Edit a key to cap its daily or monthly spend. Useful for production keys that shouldn’t accidentally run away. If a key hits its cap we return a 429 — your code can handle it gracefully."
                  ar="عدّل المفتاح لتحديد سقف إنفاقه اليومي أو الشهري. مفيد لمفاتيح الإنتاج التي لا ينبغي أن تخرج عن السيطرة بالخطأ. إذا بلغ المفتاح سقفه نُعيد الرمز 429 — ويمكن لشيفرتك التعامل معه بسلاسة."
                />
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
