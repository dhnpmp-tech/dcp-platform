import type { MetadataRoute } from 'next'

const BASE_URL = 'https://dcp.sa'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    // '' is the redesigned home at the canonical root URL. (The legacy /v2/home
    // URL 308s here, so it must NOT be listed separately — that would advertise
    // a redirecting URL and duplicate the home entry.)
    '',
    '/docs',
    '/agents',
    '/pods',
    '/inference',
    '/fine-tuning',
    '/batch',
    '/dedicated-deployments',
    // Compatibility URL for older GPU Pods links. Keep lower-priority but
    // discoverable while external references migrate to /pods.
    '/containers',
    '/architecture',
    '/pricing',
    '/setup',
    '/provider-setup',
    '/renter/playground',
    '/earn',
    '/support',
    '/status',
    '/trust-center',
    // /security is now a real public page (the security-posture surface the
    // trust center references), no longer a 308 → /trust-center placeholder.
    '/security',
    '/terms',
    '/privacy',
    '/acceptable-use',
    // Static AI-discovery surfaces (served from /public). Listed so AI crawlers
    // and answer engines find the machine-readable contract.
    '/llms.txt',
    '/docs/openapi.yaml',
  ]

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : route === '/containers' ? 0.5 : 0.7,
  }))
}
