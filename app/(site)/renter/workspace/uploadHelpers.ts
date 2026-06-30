// ─────────────────────────────────────────────────────────────────────────
// uploadHelpers — pure utilities for the resumable-upload hook.
// Extracted from useResumableUpload.ts so the hook stays focused on state.
// No React imports here — these are plain functions + types.
// ─────────────────────────────────────────────────────────────────────────

export const MIN_PART_BYTES = 5 * 1024 * 1024 // 5 MiB — S3 minimum part size
export const MAX_CONCURRENCY = 3
export const LS_PREFIX = 'dcp-ws-upload-'

export interface UploadedPart {
  part_number: number
  etag: string
}

export interface PersistedUpload {
  key: string
  upload_id: string
  parts: UploadedPart[]
  uploaded_bytes: number
  total: number
  file_name: string
  file_type: string
  started_at: number
}

// ── localStorage persistence ──────────────────────────────────────────────────

export function lsKey(key: string): string {
  return `${LS_PREFIX}${key}`
}

export function readPersisted(key: string): PersistedUpload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(lsKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedUpload
    if (
      typeof parsed.upload_id !== 'string' ||
      !Array.isArray(parsed.parts) ||
      typeof parsed.total !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writePersisted(p: PersistedUpload): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(lsKey(p.key), JSON.stringify(p))
  } catch {
    /* quota or privacy mode — non-fatal; resume simply won't survive a reload */
  }
}

export function clearPersisted(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(lsKey(key))
  } catch {
    /* ignore */
  }
}

// Find any persisted multipart upload for THIS renter (any key). Returns the
// first one found (typical case: one upload at a time).
export function findAnyPersisted(): PersistedUpload | null {
  if (typeof window === 'undefined') return null
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(LS_PREFIX)) {
        const raw = window.localStorage.getItem(k)
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedUpload
          if (parsed.upload_id) return parsed
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

// ── file slicing ─────────────────────────────────────────────────────────────

// Slice a File into 5 MiB chunks. The last part may be smaller. Returns an
// array of { part_number, blob } 1-indexed to match S3 multipart semantics.
export function sliceParts(
  file: File,
  partSize: number,
): Array<{ part_number: number; blob: Blob }> {
  const out: Array<{ part_number: number; blob: Blob }> = []
  let partNumber = 1
  let offset = 0
  while (offset < file.size) {
    const end = Math.min(offset + partSize, file.size)
    out.push({ part_number: partNumber, blob: file.slice(offset, end) })
    offset = end
    partNumber += 1
  }
  return out
}

// ── bounded async pool ───────────────────────────────────────────────────────

// Run an async pool of size N over `items`, calling `fn` on each. Respects a
// paused flag — if `isPaused()` returns true mid-flight, pending items are
// abandoned and the pool resolves.
export async function pool<T, R>(
  items: ReadonlyArray<T>,
  size: number,
  fn: (item: T) => Promise<R>,
  isPaused: () => boolean = () => false,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length)
  let cursor = 0
  const workers: Array<Promise<void>> = []
  for (let w = 0; w < size; w++) {
    workers.push(
      (async () => {
        while (cursor < items.length) {
          if (isPaused()) return
          const idx = cursor++
          results[idx] = await fn(items[idx])
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

// ── error formatting ────────────────────────────────────────────────────────

export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : 'Upload failed.'
}

// ── auth headers (shared shape with workspaceApi, kept here for the hook) ────

export function jsonHeaders(renterKey: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (renterKey) {
    h['x-renter-key'] = renterKey
    h['Authorization'] = `Bearer ${renterKey}`
  }
  return h
}

// Clamp concurrency into the supported range [1, MAX_CONCURRENCY].
export function clampConcurrency(n: number): number {
  return Math.min(Math.max(1, n), MAX_CONCURRENCY)
}

// ── backend response shapes (subset, shared with the hook) ───────────────────

export interface UploadUrlResponse {
  url: string
  method: 'PUT'
  key: string
  expires_in: number
  min_part_bytes: number
  // Content-Type pinned into the presigned signature by the backend (PR #678).
  // The browser MUST send this exact value as the PUT Content-Type header or
  // MinIO rejects with SignatureDoesNotMatch. Defaults to
  // application/octet-stream when the request omitted content_type.
  content_type: string
}
export interface MultipartStartResponse {
  upload_id: string
  key: string
  min_part_bytes: number
  max_parts: number
  // Content-Type pinned on the multipart upload — applies to the final object.
  // Part PUTs do NOT carry Content-Type (S3 UploadPart doesn't sign it), but
  // the value is what gets stored on the completed object.
  content_type: string
}
export interface PartUrlResponse {
  url: string
  part_number: number
  expires_in: number
}
export interface MultipartCompleteResponse {
  location: string
  key: string
}
export interface MultipartAbortResponse {
  aborted: boolean
  key: string
}