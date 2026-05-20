import Link from 'next/link'

export default function DraftBanner() {
  return (
    <div className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-sm leading-relaxed text-amber-100">
        <span className="font-semibold text-amber-200">📋 DRAFT — pending Saudi legal counsel review.</span>{' '}
        Effective text remains{' '}
        <Link href="/terms" className="underline hover:text-amber-50">
          /terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-amber-50">
          /privacy
        </Link>{' '}
        until further notice. English-only at this stage; Arabic translation will follow once counsel signs
        off on the binding text.
      </p>
    </div>
  )
}
