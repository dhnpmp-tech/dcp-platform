'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import { useLanguage } from '../lib/i18n'

const API_BASE = '/api'

interface ScopedKey {
  id: string
  label: string | null
  scopes: string[]
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  revoked: boolean
  key?: string
}

interface CreateKeyRequest {
  label?: string
  scopes: string[]
  expires_at?: string
}

const VALID_SCOPES = [
  { value: 'inference', label: 'Inference', description: 'Submit vLLM jobs and deployments' },
  { value: 'billing', label: 'Billing', description: 'View balance and transaction history' },
  { value: 'admin', label: 'Admin', description: 'Full account access including key management' },
]

function KeyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function EyeSlashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function ApiKeysPage() {
  const { t } = useLanguage()
  const [masterKey, setMasterKey] = useState<string | null>(null)
  const [showMasterKey, setShowMasterKey] = useState(false)
  const [scopedKeys, setScopedKeys] = useState<ScopedKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['inference'])
  const [newKeyExpiry, setNewKeyExpiry] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    if (!masterKey) return
    try {
      const res = await fetch(`${API_BASE}/renters/me/keys?key=${encodeURIComponent(masterKey)}`)
      if (!res.ok) throw new Error('Failed to load keys')
      const data = await res.json()
      setScopedKeys(data.keys || [])
    } catch (err) {
      console.error('Failed to load scoped keys:', err)
    }
  }, [masterKey])

  useEffect(() => {
    const storedKey = localStorage.getItem('dc1_renter_key')
    if (storedKey) {
      setMasterKey(storedKey)
    } else {
      setError('No API key found. Please register or log in as a renter.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (masterKey) {
      loadKeys()
      setLoading(false)
    }
  }, [masterKey, loadKeys])

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCreateKey = async () => {
    if (!masterKey) return
    setCreating(true)
    setCreateError(null)

    try {
      const body: CreateKeyRequest = {
        scopes: newKeyScopes,
      }
      if (newKeyLabel.trim()) {
        body.label = newKeyLabel.trim()
      }
      if (newKeyExpiry) {
        body.expires_at = new Date(newKeyExpiry).toISOString()
      }

      const res = await fetch(`${API_BASE}/renters/me/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': masterKey,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create key')
      }

      const newKey = await res.json()
      setNewlyCreatedKey(newKey.key)
      setNewKeyLabel('')
      setNewKeyScopes(['inference'])
      setNewKeyExpiry('')
      setShowCreateForm(false)
      await loadKeys()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!masterKey) return
    setDeletingId(keyId)
    try {
      const res = await fetch(`${API_BASE}/renters/me/keys/${keyId}?key=${encodeURIComponent(masterKey)}`, {
        method: 'DELETE',
        headers: {
          'x-renter-key': masterKey,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete key')
      }
      await loadKeys()
    } catch (err: any) {
      console.error('Failed to delete key:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  const maskKey = (key: string) => {
    if (key.length <= 12) return '***' + key.slice(-4)
    return key.slice(0, 8) + '...' + key.slice(-4)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const scopeLabel = (scope: string) => {
    const found = VALID_SCOPES.find(s => s.value === scope)
    return found ? found.label : scope
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 bg-dc1-void">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-dc1-text-muted mb-8">
            <Link href="/renter/settings" className="hover:text-dc1-amber transition-colors">
              Settings
            </Link>
            <span>/</span>
            <span className="text-dc1-text-primary">API Keys</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-dc1-text-primary mb-2">{t('api_keys.page_title')}</h1>
            <p className="text-dc1-text-secondary">
              {t('api_keys.page_subtitle')}
            </p>
          </div>

          {error && (
            <div className="bg-status-error/10 border border-status-error/30 rounded-xl p-6 text-center">
              <p className="text-status-error mb-4">{error}</p>
              <Link href="/renter/register" className="btn btn-primary">
                {t('api_keys.create_account_cta')}
              </Link>
            </div>
          )}

          {!error && (
            <>
              {/* Master Key Section */}
              <section className="bg-dc1-surface-l1 border border-dc1-border rounded-xl p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-dc1-text-primary flex items-center gap-2">
                      <KeyIcon />
                      {t('api_keys.master_section_title')}
                    </h2>
                    <p className="text-sm text-dc1-text-muted mt-1">
                      {t('api_keys.master_section_desc')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-dc1-surface-l2 border border-dc1-border rounded-lg px-4 py-3 font-mono text-sm text-dc1-text-primary">
                    {masterKey ? (
                      showMasterKey ? masterKey : maskKey(masterKey)
                    ) : (
                      '••••••••••••••••'
                    )}
                  </div>
                  {masterKey && (
                    <>
                      <button
                        onClick={() => setShowMasterKey(!showMasterKey)}
                        className="btn btn-secondary btn-sm"
                        title={showMasterKey ? 'Hide key' : 'Show key'}
                      >
                        {showMasterKey ? <EyeSlashIcon /> : <EyeIcon />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(masterKey, 'master')}
                        className="btn btn-secondary btn-sm"
                        title="Copy key"
                      >
                        {copiedId === 'master' ? (
                          <span className="text-status-success text-xs">Copied!</span>
                        ) : (
                          <CopyIcon />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </section>

              {/* Scoped Keys Section */}
              <section className="bg-dc1-surface-l1 border border-dc1-border rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-dc1-text-primary">{t('api_keys.scoped_section_title')}</h2>
                    <p className="text-sm text-dc1-text-muted mt-1">
                      {t('api_keys.scoped_section_desc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="btn btn-primary btn-sm"
                  >
                    <PlusIcon />
                    {t('api_keys.new_key_button')}
                  </button>
                </div>

                {/* Create Key Form */}
                {showCreateForm && (
                  <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 mb-6">
                    <h3 className="font-semibold text-dc1-text-primary mb-4">Create New Scoped Key</h3>

                    {newlyCreatedKey && (
                      <div className="bg-status-success/10 border border-status-success/30 rounded-lg p-4 mb-4">
                        <p className="text-sm font-semibold text-status-success mb-2">Key Created!</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-dc1-void border border-dc1-border rounded px-3 py-2 text-sm font-mono text-dc1-text-primary overflow-x-auto">
                            {newlyCreatedKey}
                          </code>
                          <button
                            onClick={() => copyToClipboard(newlyCreatedKey, 'new')}
                            className="btn btn-secondary btn-sm shrink-0"
                          >
                            {copiedId === 'new' ? <span className="text-status-success text-xs">Copied!</span> : <CopyIcon />}
                          </button>
                        </div>
                        <p className="text-xs text-dc1-text-muted mt-2">
                          Copy and save this key now. You won't be able to see it again.
                        </p>
                      </div>
                    )}

                    {createError && (
                      <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-3 mb-4">
                        <p className="text-sm text-status-error">{createError}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
                          Label (optional)
                        </label>
                        <input
                          type="text"
                          value={newKeyLabel}
                          onChange={e => setNewKeyLabel(e.target.value)}
                          placeholder="e.g., Production inference key"
                          className="input w-full"
                          maxLength={80}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
                          Scopes
                        </label>
                        <div className="space-y-2">
                          {VALID_SCOPES.map(scope => (
                            <label
                              key={scope.value}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                newKeyScopes.includes(scope.value)
                                  ? 'border-dc1-amber bg-dc1-amber/5'
                                  : 'border-dc1-border hover:border-dc1-amber/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={newKeyScopes.includes(scope.value)}
                                onChange={() => toggleScope(scope.value)}
                                className="mt-1"
                              />
                              <div>
                                <p className="font-medium text-dc1-text-primary">{scope.label}</p>
                                <p className="text-xs text-dc1-text-muted">{scope.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-dc1-text-secondary mb-2">
                          Expires At (optional)
                        </label>
                        <input
                          type="datetime-local"
                          value={newKeyExpiry}
                          onChange={e => setNewKeyExpiry(e.target.value)}
                          className="input w-full"
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleCreateKey}
                          disabled={creating || newKeyScopes.length === 0}
                          className="btn btn-primary"
                        >
                          {creating ? 'Creating...' : 'Create Key'}
                        </button>
                        <button
                          onClick={() => {
                            setShowCreateForm(false)
                            setCreateError(null)
                            setNewlyCreatedKey(null)
                          }}
                          className="btn btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Keys List */}
                {loading ? (
                  <div className="text-center py-8 text-dc1-text-muted">Loading...</div>
                ) : scopedKeys.length === 0 ? (
                  <div className="text-center py-8 text-dc1-text-muted">
                    No scoped keys yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scopedKeys.map(scopedKey => (
                      <div
                        key={scopedKey.id}
                        className="bg-dc1-surface-l2 border border-dc1-border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-dc1-text-primary">
                                {scopedKey.label || 'Unnamed key'}
                              </p>
                              {scopedKey.revoked && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-status-error/10 text-status-error border border-status-error/30">
                                  Revoked
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-mono text-dc1-text-muted truncate mb-2">
                              {scopedKey.key ? maskKey(scopedKey.key) : maskKey(scopedKey.id)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {scopedKey.scopes.map(scope => (
                                <span
                                  key={scope}
                                  className="px-2 py-0.5 rounded-full text-xs bg-dc1-amber/10 text-dc1-amber border border-dc1-amber/30"
                                >
                                  {scopeLabel(scope)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {scopedKey.key && (
                              <button
                                onClick={() => copyToClipboard(scopedKey.key!, scopedKey.id)}
                                className="btn btn-secondary btn-sm"
                                title="Copy key"
                              >
                                {copiedId === scopedKey.id ? (
                                  <span className="text-status-success text-xs">Copied!</span>
                                ) : (
                                  <CopyIcon />
                                )}
                              </button>
                            )}
                            {!scopedKey.revoked && (
                              <button
                                onClick={() => handleDeleteKey(scopedKey.id)}
                                disabled={deletingId === scopedKey.id}
                                className="btn btn-secondary btn-sm text-status-error hover:bg-status-error/10"
                                title="Revoke key"
                              >
                                {deletingId === scopedKey.id ? '...' : <TrashIcon />}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-4 mt-3 text-xs text-dc1-text-muted">
                          <span>Created: {formatDate(scopedKey.created_at)}</span>
                          {scopedKey.expires_at && (
                            <span>Expires: {formatDate(scopedKey.expires_at)}</span>
                          )}
                          {scopedKey.last_used_at && (
                            <span>Last used: {formatDate(scopedKey.last_used_at)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Help Section */}
              <section className="bg-dc1-surface-l1 border border-dc1-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-dc1-text-primary mb-4">API Key Best Practices</h2>
                <ul className="space-y-2 text-sm text-dc1-text-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-dc1-amber">•</span>
                    Use scoped keys instead of your master key for production workloads
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-dc1-amber">•</span>
                    Set expiration dates for temporary or project-specific keys
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-dc1-amber">•</span>
                    Rotate your master key immediately if exposed
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-dc1-amber">•</span>
                    Revoke unused keys promptly to minimize security surface
                  </li>
                </ul>
              </section>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}