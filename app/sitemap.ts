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
    '/containers',
    '/architecture',
    '/setup',
    '/provider-setup',
    '/renter/playground',
    '/pricing',
    '/quickstart',
    '/status',
    '/trust-center',
    '/security',
    '/legal/pdpl',
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
    priority: route === '' ? 1 : 0.7,
  }))
}
