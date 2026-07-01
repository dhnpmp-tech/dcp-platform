// ─────────────────────────────────────────────────────────────────────────
// workspaceApi — thin HTTP client for the renter workspace file endpoints
// (PR #678). All calls require the renter API key. We send BOTH `x-renter-key`
// (the established renter contract used by /renters/me, /api/volumes) and
// `Authorization: Bearer` so the calls work regardless of which auth scheme
// PR #678 settles on. No AWS SDK on the client — these are plain fetches.
// ─────────────────────────────────────────────────────────────────────────

export interface WorkspaceFile {
  key: string
  size: number
  last_modified: string | null
}

export interface WorkspaceVolume {
  size_gb: number
  status: string
  used_gb?: number
  used_pct?: number
  price_sar_per_month?: number
  price_halala_per_month?: number
  rented_at?: string
  current_period_end?: string
}

export interface VolumeOption {
  size_gb: number
  price_sar_per_month: number
  price_halala_per_month: number
}

export interface VolumesMeResponse {
  volume: WorkspaceVolume | null
  options: VolumeOption[]
  pool: { ceiling_gb: number; used_gb: number; available_gb: number }
}

export interface FilesListResponse {
  bucket: string
  prefix: string
  files: WorkspaceFile[]
  truncated: boolean
  // Opaque S3 pagination cursor from PR #678. Present only when truncated=true.
  // Pass back as ?continuation_token= to fetch the next page. The panel does
  // not yet wire a "Load more" control (MVP volumes hold <1000 objects), but
  // the field is surfaced so the type is honest and the plumbing is ready.
  next_continuation_token: string | null
  volume: { size_gb: number; status: string }
}

export interface DownloadUrlResponse {
  url: string
  method: 'GET'
  key: string
  expires_in: number
}

export interface DeleteResponse {
  deleted: boolean
  key: string
}

function authHeaders(renterKey: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (renterKey) {
    h['x-renter-key'] = renterKey
    h['Authorization'] = `Bearer ${renterKey}`
  }
  return h
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : 'Request failed.'
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === 'string') return data.error
    if (data && typeof data.message === 'string') return data.message
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`
}

// GET /api/workspace/files?prefix=&continuation_token=
// continuationToken is the opaque cursor returned in the previous response's
// next_continuation_token when truncated=true. Omitted on the first page.
export async function listFiles(
  apiBase: string,
  renterKey: string | null,
  prefix = '',
  continuationToken?: string | null,
): Promise<FilesListResponse> {
  const params: string[] = []
  if (prefix) params.push(`prefix=${encodeURIComponent(prefix)}`)
  if (continuationToken) params.push(`continuation_token=${encodeURIComponent(continuationToken)}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  const res = await fetch(`${apiBase}/workspace/files${qs}`, {
    headers: authHeaders(renterKey),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as FilesListResponse
}

// POST /api/workspace/download-url { key } → open the presigned GET
export async function downloadFile(
  apiBase: string,
  renterKey: string | null,
  key: string,
): Promise<DownloadUrlResponse> {
  const res = await fetch(`${apiBase}/workspace/download-url`, {
    method: 'POST',
    headers: authHeaders(renterKey),
    body: JSON.stringify({ key }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as DownloadUrlResponse
}

// DELETE /api/workspace/files { key }
export async function deleteFile(
  apiBase: string,
  renterKey: string | null,
  key: string,
): Promise<DeleteResponse> {
  const res = await fetch(`${apiBase}/workspace/files`, {
    method: 'DELETE',
    headers: authHeaders(renterKey),
    body: JSON.stringify({ key }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as DeleteResponse
}

// GET /api/volumes/me — the renter's active volume + usage + rent options
export async function getVolume(
  apiBase: string,
  renterKey: string | null,
): Promise<VolumesMeResponse> {
  const res = await fetch(`${apiBase}/volumes/me`, {
    headers: authHeaders(renterKey),
    cache: 'no-store',
  })
  if (res.status === 404) {
    // No volume route mounted yet (backend PR #678 not deployed) — surface as
    // "no volume" so the UI shows the rent-a-volume CTA instead of an error.
    return { volume: null, options: [], pool: { ceiling_gb: 0, used_gb: 0, available_gb: 0 } }
  }
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as VolumesMeResponse
}

// POST /api/volumes/rent { size_gb } — rent a new volume, returns the volume
export async function rentVolume(
  apiBase: string,
  renterKey: string | null,
  sizeGb: number,
): Promise<WorkspaceVolume> {
  const res = await fetch(`${apiBase}/volumes/rent`, {
    method: 'POST',
    headers: authHeaders(renterKey),
    body: JSON.stringify({ size_gb: sizeGb }),
  })
  if (!res.ok) {
    const detail = await readError(res)
    throw new Error(detail)
  }
  const data = await res.json()
  return (data.volume || data) as WorkspaceVolume
}

// ── formatting helpers (shared) ──────────────────────────────────────────────

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / Math.pow(1024, i)
  const digits = i === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0
  return `${v.toFixed(digits)} ${units[i]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

// Derive a workspace-safe key from a File. Keeps the user's filename but strips
// characters S3/MinIO disallows. Prefixes with a timestamp folder so repeated
// uploads of the same name don't clobber.
export function keyForFile(file: File): string {
  const safe = file.name
    .replace(/[^\w.\-\/؀-ۿ ]+/g, '_') // keep Arabic range, word/dot/dash/slash/space
    .replace(/^\/+/, '')
    .replace(/\.\.+/g, '.')
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return safe.includes('/') ? safe : `${stamp}/${safe}`
}

export { errMessage }