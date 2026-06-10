import type { MetadataRoute } from 'next'

const BASE_URL = 'https://dcp.sa'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    '',
    '/v2/home',
    '/v2/docs',
    '/v2/containers',
    '/v2/architecture',
    '/v2/setup',
    '/v2/provider-setup',
    '/v2/renter/playground',
    '/pricing',
    '/status',
    '/terms',
    '/privacy',
    '/acceptable-use',
  ]

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '' || route === '/v2/home' ? 'daily' : 'weekly',
    priority: route === '' || route === '/v2/home' ? 1 : 0.7,
  }))
}
