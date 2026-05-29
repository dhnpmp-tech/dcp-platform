'use client'

// Step 5 legal-consent modal. Captures provider compliance fields
// (full name, phone, city, country) + explicit PDPL consent before
// /v1/provider/install-token will mint a token for a first-time user.
// Skipped entirely for providers who already consented.

import { useState } from 'react'
import Link from 'next/link'
import { SecondaryButton } from '../primitives'

export interface LegalPayload {
  fullName: string
  phone: string
  city: string
  country: string
  pdplConsent: true
}

interface LegalConsentModalProps {
  open: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (payload: LegalPayload) => void
}

const PHONE_RE = /^[+]?[0-9][0-9\s\-().]{8,19}$/  // minimum 10 digits total (including country code)

export function LegalConsentModal({
  open, busy, error, onCancel, onSubmit,
}: LegalConsentModalProps) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('SA')
  const [consent, setConsent] = useState(false)

  if (!open) return null

  const trimmedName = fullName.trim()
  const trimmedCity = city.trim()
  const trimmedPhone = phone.trim()
  const isValid =
    trimmedName.length >= 2 && trimmedName.length <= 120 &&
    trimmedCity.length >= 2 && trimmedCity.length <= 80 &&
    PHONE_RE.test(trimmedPhone) &&
    /^[A-Z]{2}$/.test(country) &&
    consent

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || busy) return
    onSubmit({
      fullName: trimmedName,
      phone: trimmedPhone,
      city: trimmedCity,
      country,
      pdplConsent: true,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6"
      >
        <div>
          <h3 id="legal-modal-title" className="text-xl font-bold text-dc1-text-primary">
            Finish your provider profile
          </h3>
          <p className="mt-1 text-sm text-dc1-text-secondary">
            A bit more info to comply with Saudi PDPL before you can run workloads.
          </p>
        </div>

        <Field label="Full name">
          <input
            data-testid="legal-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Peter Thompson"
            className="w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 p-2 text-dc1-text-primary"
            required minLength={2} maxLength={120}
          />
        </Field>
        <Field label="Phone">
          <input
            data-testid="legal-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+966 50 123 4567"
            className="w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 p-2 text-dc1-text-primary"
            required
          />
        </Field>
        <Field label="City">
          <input
            data-testid="legal-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Riyadh"
            className="w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 p-2 text-dc1-text-primary"
            required minLength={2} maxLength={80}
          />
        </Field>
        <Field label="Country">
          <select
            data-testid="legal-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-lg border border-dc1-border bg-dc1-surface-l2 p-2 text-dc1-text-primary"
          >
            <option value="SA">Saudi Arabia</option>
            <option value="AE">United Arab Emirates</option>
            <option value="BH">Bahrain</option>
            <option value="KW">Kuwait</option>
            <option value="OM">Oman</option>
            <option value="QA">Qatar</option>
            <option value="EG">Egypt</option>
            <option value="JO">Jordan</option>
            <option value="LB">Lebanon</option>
            <option value="IQ">Iraq</option>
            <option value="PS">Palestine</option>
            <option value="TR">Turkey</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="NL">Netherlands</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="IN">India</option>
            <option value="PK">Pakistan</option>
            <option value="BD">Bangladesh</option>
            <option value="MY">Malaysia</option>
            <option value="ID">Indonesia</option>
            <option value="SG">Singapore</option>
            <option value="ZZ">Other</option>
          </select>
        </Field>

        <label className="flex items-start gap-2 text-sm text-dc1-text-secondary">
          <input
            data-testid="legal-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree to DCP processing my data per the{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dc1-amber underline"
            >
              PDPL policy
            </Link>
            .
          </span>
        </label>

        {error && (
          <p data-testid="legal-error" className="text-sm text-status-error">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </SecondaryButton>
          <button
            type="submit"
            data-testid="legal-submit"
            disabled={!isValid || busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-dc1-amber px-5 py-2.5 text-sm font-semibold text-dc1-void hover:bg-dc1-amber-bright transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px]"
          >
            {busy && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-dc1-void border-t-transparent" />
            )}
            Accept & generate token
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
