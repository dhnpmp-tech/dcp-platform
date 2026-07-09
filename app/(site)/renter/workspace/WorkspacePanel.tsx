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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface WorkspaceFileGroup {
  id: string
  label: string
  files: WorkspaceFile[]
  totalBytes: number
}

function groupWorkspaceFiles(files: WorkspaceFile[]): WorkspaceFileGroup[] {
  const groups = new Map<string, WorkspaceFileGroup>()

  for (const file of files) {
    const normalizedKey = String(file.key || '').replace(/^\/+/, '')
    const parts = normalizedKey.split('/').filter(Boolean)
    const hasFolder = parts.length > 1
    const id = hasFolder ? parts[0] : '__root__'
    const label = hasFolder ? `${parts[0]}/` : 'Root files'
    const existing = groups.get(id)
    const target = existing || { id, label, files: [], totalBytes: 0 }
    target.files.push(file)
    target.totalBytes += Number(file.size || 0)
    groups.set(id, target)
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      files: [...group.files].sort((a, b) => String(a.key).localeCompare(String(b.key))),
    }))
    .sort((a, b) => {
      if (a.id === '__root__') return -1
      if (b.id === '__root__') return 1
      return a.label.localeCompare(b.label)
    })
}

interface WorkspacePanelProps {
  apiBase: string
  renterKey: string | null
  /** Adjusts copy when the workspace manager is embedded inside the pod launch flow. */
  context?: 'workspace' | 'pod-launch'
  /** Optional in-page jump for launch flows with many staged files. */
  nextStageHref?: string
  /** Optional callback when the renter creates a volume (e.g. to refresh shell). */
  onVolumeRented?: (vol: WorkspaceVolume) => void
  /** Optional callback whenever the current volume state is loaded/refreshed. */
  onVolumeLoaded?: (vol: WorkspaceVolume | null) => void
}

export default function WorkspacePanel({
  apiBase,
  renterKey,
  context = 'workspace',
  nextStageHref,
  onVolumeRented,
  onVolumeLoaded,
}: WorkspacePanelProps) {
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
  const [filesCollapsed, setFilesCollapsed] = useState(context === 'pod-launch')
  const [collapsedFileGroups, setCollapsedFileGroups] = useState<Set<string>>(() => new Set())

  const [confirmDelete, setConfirmDelete] = useState<WorkspaceFile | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const upload = useResumableUpload({ apiBase, renterKey, concurrency: 2 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)
  const initializedPodLaunchGroupsRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  const fileGroups = useMemo(() => groupWorkspaceFiles(files), [files])
  const totalFileBytes = useMemo(() => files.reduce((sum, file) => sum + Number(file.size || 0), 0), [files])

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  // ── load volume ─────────────────────────────────────────────────────────────
  const loadVolume = useCallback(async () => {
    if (!renterKey) {
      setVolumeState('idle')
      onVolumeLoaded?.(null)
      return
    }
    setVolumeState('loading')
    setVolumeError('')
    try {
      const data: VolumesMeResponse = await getVolume(apiBase, renterKey)
      setVolume(data.volume)
      onVolumeLoaded?.(data.volume)
      setRentOptions(data.options || [])
      setVolumeState('ready')
    } catch (e) {
      setVolumeState('error')
      setVolumeError(e instanceof Error ? e.message : 'Failed to load volume.')
    }
  }, [apiBase, renterKey, onVolumeLoaded])

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

  // In the pod launch flow the workspace is a staging checkpoint, not the main
  // destination. Keep large workspaces navigable by showing folders first and
  // leaving each folder closed until the renter intentionally opens it.
  useEffect(() => {
    if (context !== 'pod-launch' || filesState !== 'ready' || initializedPodLaunchGroupsRef.current) return
    if (fileGroups.length === 0) return
    setCollapsedFileGroups(new Set(fileGroups.map((group) => group.id)))
    initializedPodLaunchGroupsRef.current = true
  }, [context, fileGroups, filesState])

  // ── rent a volume ───────────────────────────────────────────────────────────
  async function handleRent() {
    if (!renterKey) return
    setRenting(true)
    try {
      const vol = await rentVolume(apiBase, renterKey, selectedSize)
      setVolume(vol)
      setVolumeState('ready')
      onVolumeRented?.(vol)
      onVolumeLoaded?.(vol)
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

  function toggleFileGroup(groupId: string) {
    setCollapsedFileGroups((prev) => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
  }

  function openOnlyFileGroup(groupId: string) {
    setFilesCollapsed(false)
    setCollapsedFileGroups(new Set(fileGroups.map((group) => group.id).filter((id) => id !== groupId)))
  }

  function collapseAllFileGroups() {
    setCollapsedFileGroups(new Set(fileGroups.map((group) => group.id)))
  }

  function expandAllFileGroups() {
    setCollapsedFileGroups(new Set())
  }

  return (
    <section className="ws-panel" aria-labelledby="ws-hd">
      {/* ── header ── */}
      <div className="ws-hd">
        <div>
          <h3 id="ws-hd">
            {context === 'pod-launch'
              ? <Bi en="Workspace staging" ar="تجهيز مساحة العمل" />
              : <Bi en="Workspace" ar="مساحة العمل" />}
          </h3>
          <p className="ws-sub">
            {context === 'pod-launch'
              ? (
                  <Bi
                    en="Datasets, notebooks, adapters, and checkpoints here reattach at /workspace on the next pod."
                    ar="مجموعات البيانات والدفاتر والمحوّلات ونقاط الحفظ هنا تُعاد في /workspace عند الحاوية التالية."
                  />
                )
              : (
                  <Bi
                    en="Files here persist across pods on your rented in-Kingdom volume."
                    ar="الملفات هنا تبقى عبر الحاويات على وحدة التخزين المستأجرة داخل المملكة."
                  />
                )}
          </p>
        </div>
        <div className="ws-hd-actions">
          {context === 'pod-launch' && nextStageHref && (
            <a className="ws-stage-link" href={nextStageHref}>
              <Bi en="Stage 2" ar="المرحلة 2" />
            </a>
          )}
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
          context={context}
        />
      )}

      {/* ── file list ── */}
      <div className="ws-files">
        <div className="ws-files-hd">
          <div className="ws-files-title">
            <h4>
              {context === 'pod-launch'
                ? <Bi en="Staged files" ar="الملفات المجهزة" />
                : <Bi en="Files" ar="الملفات" />}
            </h4>
            {files.length > 0 && (
              <span className="ws-files-count">
                {files.length} · {humanBytes(totalFileBytes)}
              </span>
            )}
          </div>
          {(files.length > 0 || (context === 'pod-launch' && nextStageHref)) && (
            <div className="ws-files-actions">
              {context === 'pod-launch' && nextStageHref && (
                <a className="ws-files-next" href={nextStageHref}>
                  <Bi en="Go to Stage 2" ar="انتقل للمرحلة 2" />
                </a>
              )}
              {files.length > 0 && (
                <button
                  type="button"
                  className="ws-files-toggle"
                  aria-expanded={!filesCollapsed}
                  onClick={() => setFilesCollapsed((value) => !value)}
                >
                  {filesCollapsed
                    ? <Bi en="Show" ar="إظهار" />
                    : <Bi en="Collapse" ar="طي" />}
                </button>
              )}
              {files.length > 0 && !filesCollapsed && fileGroups.length > 0 && (
                <>
                  <button type="button" className="ws-files-toggle" onClick={expandAllFileGroups}>
                    <Bi en="Expand all" ar="افتح الكل" />
                  </button>
                  <button type="button" className="ws-files-toggle" onClick={collapseAllFileGroups}>
                    <Bi en="Collapse all" ar="اطوِ الكل" />
                  </button>
                </>
              )}
            </div>
          )}
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
              {context === 'pod-launch'
                ? <Bi en="No staged files yet." ar="لا توجد ملفات مجهزة بعد." />
                : <Bi en="No files yet. Upload one above." ar="لا توجد ملفات بعد. ارفع واحداً بالأعلى." />}
            </p>
          </div>
        )}

        {filesState === 'error' && (
          <div className="ws-err" role="alert">
            {filesError}
          </div>
        )}

        {filesState === 'ready' && files.length > 0 && filesCollapsed && (
          <div className="ws-files-summary" aria-label={lang === 'ar' ? 'ملخص مجلدات مساحة العمل' : 'Workspace folder summary'}>
            {fileGroups.slice(0, 4).map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => openOnlyFileGroup(group.id)}
                aria-label={
                  lang === 'ar'
                    ? `افتح ${group.label} وفيه ${group.files.length} ملفات`
                    : `Open ${group.label} with ${group.files.length} files`
                }
              >
                {group.label} · {group.files.length}
              </button>
            ))}
            {fileGroups.length > 4 && <span>+{fileGroups.length - 4}</span>}
          </div>
        )}

        {filesState === 'ready' && files.length > 0 && !filesCollapsed && (
          <ul className="ws-file-groups" role="list">
            {fileGroups.map((group) => {
              const collapsed = collapsedFileGroups.has(group.id)
              return (
                <li key={group.id} className="ws-file-group" data-collapsed={collapsed}>
                  <button
                    type="button"
                    className="ws-file-group-hd"
                    aria-expanded={!collapsed}
                    onClick={() => toggleFileGroup(group.id)}
                  >
                    <span className="chev" aria-hidden="true">▾</span>
                    <span className="nm">{group.label}</span>
                    <span className="meta">
                      {group.files.length} · {humanBytes(group.totalBytes)}
                    </span>
                  </button>
                  {!collapsed && (
                    <ul className="ws-file-list" role="list">
                      {group.files.map((f) => (
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
                </li>
              )
            })}
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
