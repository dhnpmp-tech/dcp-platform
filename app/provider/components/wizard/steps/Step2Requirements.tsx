'use client'

// Step 2: System Requirements Check (informational).
// The wizard can't probe the provider's hardware, so this step shows an
// OS-specific checklist and asks the provider to self-confirm.

import { useState } from 'react'
import { PrimaryButton, SecondaryButton } from '../primitives'
import { detectOS, OS_PROFILES, type DetectedOS } from '../os-detect'

interface Step2Props {
  initialOs?: DetectedOS
  onContinue: (os: DetectedOS) => void
  onBack: () => void
}

export function Step2Requirements({ initialOs, onContinue, onBack }: Step2Props) {
  const [os, setOs] = useState<DetectedOS>(initialOs ?? detectOS())
  const [ack, setAck] = useState(false)
  const [showDetect, setShowDetect] = useState(false)
  const profile = OS_PROFILES[os]

  return (
    <div className="space-y-5 rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 md:p-8">
      <div>
        <h2 className="text-2xl font-bold text-dc1-text-primary">
          Can Your Machine Run DCP?
        </h2>
        <p className="mt-1 text-sm text-dc1-text-secondary">
          Quick check — we&apos;ll confirm everything after install.
        </p>
      </div>

      {/* OS selector */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">
          Operating system
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(['windows', 'macos', 'linux'] as DetectedOS[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOs(k)}
              className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                os === k
                  ? 'border-dc1-amber bg-dc1-amber/10 text-dc1-amber'
                  : 'border-dc1-border bg-dc1-surface-l2 text-dc1-text-secondary hover:text-dc1-text-primary'
              }`}
            >
              <div className="text-lg">{OS_PROFILES[k].flag}</div>
              <div>{OS_PROFILES[k].label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Requirements list */}
      <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-dc1-text-primary">
          <span>{profile.flag}</span>
          <span>{profile.label} Requirements</span>
        </p>
        <ul className="space-y-1.5">
          {profile.minReqs.map((req) => (
            <li key={req} className="flex items-start gap-2 text-sm text-dc1-text-secondary">
              <span className="mt-0.5 text-status-success">✓</span>
              <span>{req}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowDetect(!showDetect)}
          className="mt-3 text-xs text-dc1-amber hover:underline"
        >
          {showDetect ? 'Hide' : 'Can&apos;t find your GPU?'}
        </button>
        {showDetect && (
          <p className="mt-2 rounded-md border border-dc1-border bg-dc1-surface-l1 p-3 text-xs text-dc1-text-secondary">
            {profile.gpuDetectHint}
          </p>
        )}
      </div>

      {/* Acknowledgement */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-3 hover:bg-dc1-surface-l3">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-dc1-amber"
        />
        <span className="text-sm text-dc1-text-primary">
          My machine meets these requirements.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton onClick={() => onContinue(os)} disabled={!ack}>
          Continue →
        </PrimaryButton>
      </div>
    </div>
  )
}
