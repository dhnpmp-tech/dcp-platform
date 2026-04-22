import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dc1-void flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        {/* Large 404 */}
        <h1 className="text-8xl font-bold text-dc1-amber mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-dc1-text-primary mb-3">
          Page Not Found
        </h2>
        <p className="text-dc1-text-secondary mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the URL or navigate to one of the pages below.
        </p>

        {/* Quick navigation */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary hover:border-dc1-amber hover:text-dc1-amber transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-4 7 4M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
            </svg>
            Home
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary hover:border-dc1-amber hover:text-dc1-amber transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign In
          </Link>
          <Link
            href="/setup"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary hover:border-dc1-amber hover:text-dc1-amber transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Become a Provider
          </Link>
          <Link
            href="/renter/register"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-dc1-surface-l2 border border-dc1-border text-dc1-text-primary hover:border-dc1-amber hover:text-dc1-amber transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Rent GPUs
          </Link>
        </div>

        {/* Support link */}
        <p className="text-sm text-dc1-text-muted">
          Need help? Visit our{' '}
          <Link href="/support" className="text-dc1-amber hover:underline">
            support page
          </Link>{' '}
          or check the{' '}
          <Link href="/docs" className="text-dc1-amber hover:underline">
            documentation
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
