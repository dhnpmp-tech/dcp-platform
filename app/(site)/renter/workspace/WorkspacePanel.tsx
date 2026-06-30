'use client'

// ─────────────────────────────────────────────────────────────────────────
// WorkspacePanel — renter workspace file manager.
//
// Orchestrates: volume usage (VolumeSection), upload (UploadDropzone +
// useResumableUpload), file list (download/delete). Sub-components live in
// their own files so this stays focused on data flow + state.
//
// Visual language: editorial-luxury dark theme from dcp-kit.css tokens.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { useResumableUpload } from './useResumableUpload'
import VolumeSection, { type VolumeFetchState } from './VolumeSection'
import UploadDropzone from './UploadDropzone'
import {
  deleteFile,
  downloadFile,
  formatDate,
  humanBytes,
  keyForFile,
  listFiles,
  rentVolume,
  getVolume,
  type FilesListResponse,
  type VolumeOption,
  type VolumesMeResponse,
  type WorkspaceFile,
  type WorkspaceVolume,
} from './workspaceApi'
import './workspace.css'

type FilesFetchState = 'idle' | 'loading' | 'ready' | 'error'

interface WorkspacePanelProps {
  apiBase: string
  renterKey: string | null
  /** Optional callback when the renter creates a volume (e.g. to refresh shell). */
  onVolumeRented?: (vol: WorkspaceVolume) => void
}

export default function WorkspacePanel({ apiBase, renterKey, onVolumeRented }: WorkspacePanelProps) {
  const { lang } = useV2()

  const [volume, setVolume] = useState<WorkspaceVolume | null>(null)
  const [volumeState, setVolumeState] = useState<VolumeFetchState>('idle')
  const [volumeError, setVolumeError] = useState('')
  const [rentOptions, setRentOptions] = useState<VolumeOption[]>([])
  const [selectedSize, setSelectedSize] = useState<number>(10)
  const [renting, setRenting] = useState(false)

  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [filesState, setFilesState] = useState<FilesFetchState>('idle')
  const [filesError, setFilesError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<WorkspaceFile | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const upload = useResumableUpload({ apiBase, renterKey, concurrency: 2 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  // ── load volume ─────────────────────────────────────────────────────────────
  const loadVolume = useCallback(async () => {
    if (!renterKey) {
      setVolumeState('idle')
      return
    }
    setVolumeState('loading')
    setVolumeError('')
    try {
      const data: VolumesMeResponse = await getVolume(apiBase, renterKey)
      setVolume(data.volume)
      setRentOptions(data.options || [])
      setVolumeState('ready')
    } catch (e) {
      setVolumeState('error')
      setVolumeError(e instanceof Error ? e.message : 'Failed to load volume.')
    }
  }, [apiBase, renterKey])

  // ── load files ──────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!renterKey) {
      setFilesState('idle')
      return
    }
    // Don't attempt the files list if there's no active volume — backend 409s.
    if (volumeState === 'ready' && !volume) {
      setFiles([])
      setFilesState('idle')
      return
    }
    setFilesState('loading')
    setFilesError('')
    try {
      const data: FilesListResponse = await listFiles(apiBase, renterKey, '')
      setFiles(data.files || [])
      setFilesState('ready')
    } catch (e) {
      setFilesState('error')
      setFilesError(e instanceof Error ? e.message : 'Failed to load files.')
    }
  }, [apiBase, renterKey, volume, volumeState])

  useEffect(() => {
    loadVolume()
  }, [loadVolume])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  // When an upload completes, refresh the file list so the new file appears.
  useEffect(() => {
    if (upload.state.status === 'completed') loadFiles()
  }, [upload.state.status, loadFiles])

  // ── rent a volume ───────────────────────────────────────────────────────────
  async function handleRent() {
    if (!renterKey) return
    setRenting(true)
    try {
      const vol = await rentVolume(apiBase, renterKey, selectedSize)
      setVolume(vol)
      setVolumeState('ready')
      onVolumeRented?.(vol)
      flash('ok', lang === 'ar' ? `تم تفعيل حجم ${vol.size_gb} غيغابايت` : `${vol.size_gb} GB volume ready`)
      setTimeout(loadFiles, 100)
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Failed to rent volume.')
    } finally {
      setRenting(false)
    }
  }

  // ── download ────────────────────────────────────────────────────────────────
  async function handleDownload(file: WorkspaceFile) {
    try {
      const { url } = await downloadFile(apiBase, renterKey, file.key)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Download failed.')
    }
  }

  // ── delete ──────────────────────────────────────────────────────────────────
  async function confirmDeleteFile() {
    const file = confirmDelete
    if (!file) return
    try {
      await deleteFile(apiBase, renterKey, file.key)
      setFiles((prev) => prev.filter((f) => f.key !== file.key))
      flash('ok', lang === 'ar' ? 'تم الحذف' : 'Deleted')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setConfirmDelete(null)
    }
  }

  // ── upload: drag/drop + picker ──────────────────────────────────────────────
  function pickFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const key = keyForFile(file)
    upload.upload(file, key)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files) pickFiles(e.dataTransfer.files)
  }

  return (
    <section className="ws-panel" aria-labelledby="ws-hd">
      {/* ── header ── */}
      <div className="ws-hd">
        <div>
          <h3 id="ws-hd">
            <Bi en="Workspace" ar="مساحة العمل" />
          </h3>
          <p className="ws-sub">
            <Bi
              en="Files here persist across pods on your rented in-Kingdom volume."
              ar="الملفات هنا تبقى عبر الحاويات على وحدة التخزين المستأجرة داخل المملكة."
            />
          </p>
        </div>
        <button
          className="ws-refresh"
          onClick={() => {
            loadVolume()
            loadFiles()
          }}
          disabled={filesState === 'loading'}
          aria-label={lang === 'ar' ? 'تحديث' : 'Refresh'}
        >
          ↻
        </button>
      </div>

      {/* ── volume usage / rent CTA ── */}
      <div className="ws-volume">
        <VolumeSection
          volumeState={volumeState}
          volume={volume}
          rentOptions={rentOptions}
          volumeError={volumeError}
          selectedSize={selectedSize}
          onSelectSize={setSelectedSize}
          onRent={handleRent}
          renting={renting}
        />
      </div>

      {/* ── upload dropzone + resume wizard ── */}
      {volume && (
        <UploadDropzone
          state={upload.state}
          fileInputRef={fileInputRef}
          resumeInputRef={resumeInputRef}
          dragOver={dragOver}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onPick={pickFiles}
          onResumeFile={(e) => {
            const f = e.target.files?.[0]
            if (f) upload.resumeWithFile(f)
            e.target.value = ''
          }}
          onPause={upload.pause}
          onAbort={upload.abort}
          onDiscardResumable={upload.discardResumable}
          onRetryPicker={() => fileInputRef.current?.click()}
        />
      )}

      {/* ── file list ── */}
      <div className="ws-files">
        <div className="ws-files-hd">
          <h4>
            <Bi en="Files" ar="الملفات" />
          </h4>
          {files.length > 0 && <span className="ws-files-count">{files.length}</span>}
        </div>

        {filesState === 'loading' && (
          <div className="ws-skel">
            <span className="skeleton line" style={{ width: '90%' }} />
            <span className="skeleton line" style={{ width: '75%' }} />
            <span className="skeleton line" style={{ width: '60%' }} />
          </div>
        )}

        {filesState === 'ready' && files.length === 0 && (
          <div className="ws-empty">
            <span className="ws-empty-ic">∅</span>
            <p>
              <Bi en="No files yet. Upload one above." ar="لا توجد ملفات بعد. ارفع واحداً بالأعلى." />
            </p>
          </div>
        )}

        {filesState === 'error' && (
          <div className="ws-err" role="alert">
            {filesError}
          </div>
        )}

        {filesState === 'ready' && files.length > 0 && (
          <ul className="ws-file-list" role="list">
            {files.map((f) => (
              <li key={f.key} className="ws-file-row">
                <div className="ws-file-key" title={f.key}>
                  {f.key}
                </div>
                <div className="ws-file-size mono">{humanBytes(f.size)}</div>
                <div className="ws-file-date mono">{formatDate(f.last_modified)}</div>
                <div className="ws-file-actions">
                  <button
                    className="ws-act"
                    onClick={() => handleDownload(f)}
                    aria-label={lang === 'ar' ? 'تنزيل' : 'Download'}
                    title={lang === 'ar' ? 'تنزيل' : 'Download'}
                  >
                    ↓
                  </button>
                  <button
                    className="ws-act danger"
                    onClick={() => setConfirmDelete(f)}
                    aria-label={lang === 'ar' ? 'حذف' : 'Delete'}
                    title={lang === 'ar' ? 'حذف' : 'Delete'}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── delete confirm modal ── */}
      {confirmDelete && (
        <div
          className="ws-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ws-del-hd"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="ws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ws-modal-hd">
              <h3 id="ws-del-hd">
                <Bi en="Delete file?" ar="حذف الملف؟" />
              </h3>
            </div>
            <div className="ws-modal-body">
              <p>
                <Bi en="This permanently deletes" ar="سيؤدي هذا إلى حذف" />
              </p>
              <code className="ws-del-key">{confirmDelete.key}</code>
              <p className="ws-del-warn">
                <Bi en="This cannot be undone." ar="لا يمكن التراجع عن هذا." />
              </p>
            </div>
            <div className="ws-modal-ft">
              <button className="ws-up-btn" onClick={() => setConfirmDelete(null)}>
                <Bi en="Cancel" ar="إلغاء" />
              </button>
              <button className="ws-up-btn danger primary" onClick={confirmDeleteFile}>
                <Bi en="Delete" ar="حذف" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── toast ── */}
      {toast && (
        <div className={`ws-toast ${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}
    </section>
  )
}