'use client'

// ─────────────────────────────────────────────────────────────────────────
// useResumableUpload — chunked, resumable uploads to the renter workspace
// volume via the backend's presigned-URL endpoints (PR #678).
//
// Routing:
//   - File size < MIN_PART_BYTES (5 MiB) → single PUT via /api/workspace/upload-url.
//   - File size >= MIN_PART_BYTES        → multipart: start → per-part PUT → complete.
//
// Resume:
//   Multipart state { key, upload_id, parts, uploaded_bytes, total, file_meta }
//   is persisted to localStorage keyed by `dcp-ws-upload-<key>`. On mount, if a
//   resumable upload exists, the hook surfaces it via `resumable` so the UI can
//   offer Resume (re-select the same file) or Discard. On complete/abort the
//   localStorage entry is cleared.
//
// Auth: sends BOTH `x-renter-key` (established renter contract) and
// `Authorization: Bearer` so the hook works regardless of which auth scheme
// PR #678 settles on.
//
// Concurrency: parts upload sequentially by default (simple + safe). Set
// `concurrency` up to 3 to parallelise. All state updates are immutable.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MIN_PART_BYTES,
  clampConcurrency,
  clearPersisted,
  errMessage,
  findAnyPersisted,
  jsonHeaders,
  pool,
  sliceParts,
  writePersisted,
  type MultipartAbortResponse,
  type MultipartCompleteResponse,
  type MultipartStartResponse,
  type PartUrlResponse,
  type PersistedUpload,
  type UploadedPart,
  type UploadUrlResponse,
} from './uploadHelpers'

export type UploadStatus =
  | 'idle'
  | 'reading'
  | 'uploading'
  | 'paused'
  | 'completing'
  | 'completed'
  | 'aborting'
  | 'aborted'
  | 'error'

export interface UploadState {
  status: UploadStatus
  key: string | null
  total: number
  uploadedBytes: number
  partNumber: number
  totalParts: number
  error: string | null
  resumable: PersistedUpload | null
}

export interface UseResumableUploadOptions {
  apiBase: string
  renterKey: string | null
  concurrency?: number
}

const DEFAULT_CONCURRENCY = 1

export function useResumableUpload({
  apiBase,
  renterKey,
  concurrency = DEFAULT_CONCURRENCY,
}: UseResumableUploadOptions) {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    key: null,
    total: 0,
    uploadedBytes: 0,
    partNumber: 0,
    totalParts: 0,
    error: null,
    resumable: null,
  })

  // Refs hold live upload bookkeeping so async part PUTs update without stale
  // closures. `pausedRef` lets an in-flight loop bail out cooperatively.
  const partsRef = useRef<Map<number, UploadedPart>>(new Map())
  const pausedRef = useRef(false)
  const uploadIdRef = useRef<string | null>(null)
  const keyRef = useRef<string | null>(null)
  const concurrencyRef = useRef<number>(clampConcurrency(concurrency))

  useEffect(() => {
    concurrencyRef.current = clampConcurrency(concurrency)
  }, [concurrency])

  // On mount, surface any interrupted multipart upload so the UI can offer resume.
  useEffect(() => {
    const found = findAnyPersisted()
    if (found) setState((s) => ({ ...s, resumable: found }))
    return () => {
      pausedRef.current = true
    }
  }, [])

  const updateProgress = useCallback((uploadedBytes: number, partNumber: number) => {
    setState((s) => ({ ...s, uploadedBytes, partNumber }))
  }, [])

  // ── single-PUT path (small files) ──────────────────────────────────────────
  async function singlePut(file: File, key: string): Promise<void> {
    setState((s) => ({
      ...s,
      status: 'uploading',
      key,
      total: file.size,
      uploadedBytes: 0,
      partNumber: 1,
      totalParts: 1,
      error: null,
    }))
    const res = await fetch(`${apiBase}/workspace/upload-url`, {
      method: 'POST',
      headers: jsonHeaders(renterKey),
      body: JSON.stringify({ key, content_type: file.type || 'application/octet-stream' }),
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.error || `upload-url failed: HTTP ${res.status}`)
    }
    // The backend pins content_type into the presigned signature (PR #678). We
    // MUST send the exact same value on the PUT or MinIO rejects with
    // SignatureDoesNotMatch. Use the returned value, not file.type, so the
    // header always matches what was signed.
    const { url, content_type: pinnedContentType } = (await res.json()) as UploadUrlResponse
    const putRes = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': pinnedContentType },
    })
    if (!putRes.ok) throw new Error(`Upload failed: HTTP ${putRes.status}`)
    setState((s) => ({ ...s, status: 'completed', uploadedBytes: file.size, partNumber: 1 }))
  }

  // ── multipart path (large files) ────────────────────────────────────────────
  async function putPart(key: string, uploadId: string, partNumber: number, blob: Blob): Promise<UploadedPart> {
    const urlRes = await fetch(`${apiBase}/workspace/multipart/part-url`, {
      method: 'POST',
      headers: jsonHeaders(renterKey),
      body: JSON.stringify({ key, upload_id: uploadId, part_number: partNumber }),
    })
    if (!urlRes.ok) {
      const detail = await urlRes.json().catch(() => ({}))
      throw new Error(detail.error || `part-url failed: HTTP ${urlRes.status}`)
    }
    const { url } = (await urlRes.json()) as PartUrlResponse
    const putRes = await fetch(url, { method: 'PUT', body: blob })
    if (!putRes.ok) throw new Error(`Part ${partNumber} upload failed: HTTP ${putRes.status}`)
    const etag = putRes.headers.get('ETag') || ''
    return { part_number: partNumber, etag }
  }

  async function startMultipart(file: File, key: string): Promise<string> {
    const res = await fetch(`${apiBase}/workspace/multipart/start`, {
      method: 'POST',
      headers: jsonHeaders(renterKey),
      body: JSON.stringify({ key, content_type: file.type || 'application/octet-stream' }),
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.error || `multipart/start failed: HTTP ${res.status}`)
    }
    const data = (await res.json()) as MultipartStartResponse
    uploadIdRef.current = data.upload_id
    keyRef.current = key
    writePersisted({
      key,
      upload_id: data.upload_id,
      parts: [],
      uploaded_bytes: 0,
      total: file.size,
      file_name: file.name,
      file_type: file.type,
      started_at: Date.now(),
    })
    return data.upload_id
  }

  async function completeMultipart(key: string, uploadId: string): Promise<void> {
    const parts = Array.from(partsRef.current.values()).sort((a, b) => a.part_number - b.part_number)
    setState((s) => ({ ...s, status: 'completing' }))
    const res = await fetch(`${apiBase}/workspace/multipart/complete`, {
      method: 'POST',
      headers: jsonHeaders(renterKey),
      body: JSON.stringify({ key, upload_id: uploadId, parts }),
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.error || `multipart/complete failed: HTTP ${res.status}`)
    }
    ;(await res.json()) as MultipartCompleteResponse
    clearPersisted(key)
    uploadIdRef.current = null
    keyRef.current = null
    partsRef.current = new Map()
  }

  // Persist after each part and update progress.
  function persistProgress(
    key: string,
    uploadId: string,
    part: UploadedPart,
    uploaded: number,
    file: File,
    startedAt: number,
  ): void {
    partsRef.current.set(part.part_number, part)
    writePersisted({
      key,
      upload_id: uploadId,
      parts: Array.from(partsRef.current.values()),
      uploaded_bytes: uploaded,
      total: file.size,
      file_name: file.name,
      file_type: file.type,
      started_at: startedAt,
    })
  }

  async function multipartUpload(file: File, key: string): Promise<void> {
    setState((s) => ({
      ...s,
      status: 'uploading',
      key,
      total: file.size,
      uploadedBytes: 0,
      partNumber: 0,
      totalParts: 0,
      error: null,
    }))
    const uploadId = await startMultipart(file, key)
    const parts = sliceParts(file, MIN_PART_BYTES)
    setState((s) => ({ ...s, totalParts: parts.length }))
    partsRef.current = new Map()
    const startedAt = Date.now()

    let uploaded = 0
    await pool(parts, concurrencyRef.current, async ({ part_number, blob }) => {
      if (pausedRef.current) return
      const part = await putPart(key, uploadId, part_number, blob)
      uploaded += blob.size
      persistProgress(key, uploadId, part, uploaded, file, startedAt)
      updateProgress(uploaded, part_number)
    }, () => pausedRef.current)

    if (pausedRef.current) {
      setState((s) => ({ ...s, status: 'paused' }))
      return
    }
    await completeMultipart(key, uploadId)
    setState((s) => ({ ...s, status: 'completed', uploadedBytes: file.size }))
  }

  // ── public actions ─────────────────────────────────────────────────────────

  const upload = useCallback(
    async (file: File, key: string) => {
      if (!renterKey) {
        setState((s) => ({ ...s, status: 'error', error: 'Renter API key required.' }))
        return
      }
      pausedRef.current = false
      try {
        if (file.size < MIN_PART_BYTES) {
          await singlePut(file, key)
        } else {
          await multipartUpload(file, key)
        }
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: errMessage(e) }))
      }
    },
    [renterKey, apiBase],
  )

  const pause = useCallback(() => {
    pausedRef.current = true
    setState((s) => (s.status === 'uploading' ? { ...s, status: 'paused' } : s))
  }, [])

  // Resume wizard is driven from the UI: the user re-selects the same file,
  // the panel calls resumeWithFile, and the hook re-slices only the missing
  // parts. (localStorage doesn't store bytes — we need them to resume.)
  const resume = useCallback(() => {
    /* intentional no-op marker — use resumeWithFile(file) */
  }, [])

  const resumeWithFile = useCallback(
    async (file: File) => {
      const persisted = state.resumable
      if (!persisted || !renterKey) return
      if (file.size !== persisted.total) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'Selected file size does not match the interrupted upload. Aborting resume.',
        }))
        return
      }
      pausedRef.current = false
      uploadIdRef.current = persisted.upload_id
      keyRef.current = persisted.key
      const done = new Set(persisted.parts.map((p) => p.part_number))
      partsRef.current = new Map(persisted.parts.map((p) => [p.part_number, p]))

      const allParts = sliceParts(file, MIN_PART_BYTES)
      const missing = allParts.filter((p) => !done.has(p.part_number))

      setState((s) => ({
        ...s,
        status: 'uploading',
        key: persisted.key,
        total: persisted.total,
        uploadedBytes: persisted.uploaded_bytes,
        totalParts: allParts.length,
        partNumber: 0,
        error: null,
        resumable: null,
      }))

      try {
        let uploaded = persisted.uploaded_bytes
        await pool(missing, concurrencyRef.current, async ({ part_number, blob }) => {
          if (pausedRef.current) return
          const part = await putPart(persisted.key, persisted.upload_id, part_number, blob)
          partsRef.current.set(part_number, part)
          uploaded += blob.size
          writePersisted({
            key: persisted.key,
            upload_id: persisted.upload_id,
            parts: Array.from(partsRef.current.values()),
            uploaded_bytes: uploaded,
            total: persisted.total,
            file_name: file.name,
            file_type: file.type,
            started_at: persisted.started_at,
          })
          updateProgress(uploaded, part_number)
        }, () => pausedRef.current)
        if (pausedRef.current) {
          setState((s) => ({ ...s, status: 'paused' }))
          return
        }
        await completeMultipart(persisted.key, persisted.upload_id)
        setState((s) => ({ ...s, status: 'completed', uploadedBytes: persisted.total }))
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: errMessage(e) }))
      }
    },
    [state.resumable, renterKey, apiBase, updateProgress],
  )

  const abort = useCallback(async () => {
    const uploadId = uploadIdRef.current
    const key = keyRef.current
    pausedRef.current = true
    if (uploadId && key) {
      try {
        setState((s) => ({ ...s, status: 'aborting' }))
        const res = await fetch(`${apiBase}/workspace/multipart/abort`, {
          method: 'POST',
          headers: jsonHeaders(renterKey),
          body: JSON.stringify({ key, upload_id: uploadId }),
        })
        if (res.ok) {
          ;(await res.json().catch(() => null)) as MultipartAbortResponse | null
        }
      } catch {
        /* best-effort — clear local state regardless */
      }
      clearPersisted(key)
    }
    uploadIdRef.current = null
    keyRef.current = null
    partsRef.current = new Map()
    setState((s) => ({
      ...s,
      status: 'aborted',
      key: null,
      uploadedBytes: 0,
      partNumber: 0,
      totalParts: 0,
      resumable: null,
    }))
  }, [apiBase, renterKey])

  const discardResumable = useCallback(() => {
    const persisted = state.resumable
    if (persisted) clearPersisted(persisted.key)
    setState((s) => ({ ...s, resumable: null }))
  }, [state.resumable])

  const reset = useCallback(() => {
    pausedRef.current = false
    uploadIdRef.current = null
    keyRef.current = null
    partsRef.current = new Map()
    setState({
      status: 'idle',
      key: null,
      total: 0,
      uploadedBytes: 0,
      partNumber: 0,
      totalParts: 0,
      error: null,
      resumable: null,
    })
  }, [])

  return {
    state,
    upload,
    pause,
    resume,
    resumeWithFile,
    abort,
    discardResumable,
    reset,
    minPartBytes: MIN_PART_BYTES,
  }
}