'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Job emails deep-link to /renter/jobs/:jobId, but the v2 job-history view
// lives at /renter/usage. Redirect there so the email links resolve instead
// of hitting a Next.js 404.
export default function RenterJobRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/renter/usage')
  }, [router])

  return null
}
