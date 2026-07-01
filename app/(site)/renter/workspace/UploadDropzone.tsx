'use client'

// ─────────────────────────────────────────────────────────────────────────
// UploadDropzone — drag-drop + file picker + live progress + pause/resume/abort.
// Extracted from WorkspacePanel. Reads its state from the useResumableUpload
// hook's `state` and calls back into the hook's actions.
// ─────────────────────────────────────────────────────────────────────────

import { type ChangeEvent, type DragEvent, type RefObject } from 'react'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { humanBytes } from './workspaceApi'
import type { UploadState } from './useResumableUpload'

interface UploadDropzoneProps {
  state: UploadState
  fileInputRef: RefObject<HTMLInputElement | null>
  resumeInputRef: RefObject<HTMLInputElement | null>
  dragOver: boolean
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onPick: (files: FileList | null) => void
  onResumeFile: (e: ChangeEvent<HTMLInputElement>) => void
  onPause: () => void
  onAbort: () => void
  onDiscardResumable: () => void
  onRetryPicker: () => void
}

export default function UploadDropzone({
  state,
  fileInputRef,
  resumeInputRef,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onPick,
  onResumeFile,
  onPause,
  onAbort,
  onDiscardResumable,
  onRetryPicker,
}: UploadDropzoneProps) {
  const { lang } = useV2()

  const uploadPct =
    state.total > 0 ? Math.min(100, Math.round((state.uploadedBytes / state.total) * 100)) : 0
  const isUploading = state.status === 'uploading'
  const isPaused = state.status === 'paused'
  const isBusy = isUploading || state.status === 'completing'
  const isIdleish =
    state.status === 'idle' ||
    state.status === 'completed' ||
    state.status === 'aborted' ||
    state.status === 'error'

  return (
    <>
      <div
        className={`ws-drop${dragOver ? ' over' : ''}${isBusy ? ' busy' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onClick={() => !isBusy && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isBusy) {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        aria-label={lang === 'ar' ? 'اسحب ملفاً للرفع أو اضغط للاختيار' : 'Drop a file or click to choose'}
      >
        <input
          ref={fileInputRef as RefObject<HTMLInputElement>}
          type="file"
          className="ws-file-input"
          onChange={(e) => {
            onPick(e.target.files)
            e.target.value = ''
          }}
        />
        {isIdleish ? (
          <div className="ws-drop-idle">
            <span className="ws-drop-ic">↑</span>
            <span>
              <Bi en="Drop a file to upload" ar="أفلِت ملفاً للرفع" />
            </span>
            <span className="ws-drop-hint">
              <Bi
                en="Single PUT for < 5 MiB · resumable multipart above"
                ar="رفع واحد أقل من 5 ميبي · متعدد الأجزاء قابل للاستئناف فوق ذلك"
              />
            </span>
          </div>
        ) : (
          <div className="ws-drop-busy">
            <div className="ws-up-name">
              <span className="ws-up-key">{state.key}</span>
              <span className="ws-up-pct">{uploadPct}%</span>
            </div>
            <div
              className="ws-up-bar"
              role="progressbar"
              aria-valuenow={uploadPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${uploadPct}%` }} />
            </div>
            <div className="ws-up-meta">
              <span>
                {humanBytes(state.uploadedBytes)}{' '}
                <span className="u">/ {humanBytes(state.total)}</span>
              </span>
              {state.totalParts > 0 && (
                <span>
                  <Bi en="part" ar="جزء" /> {state.partNumber}/{state.totalParts}
                </span>
              )}
              {state.status === 'completing' && (
                <span className="ws-up-fin">
                  <Bi en="finalizing…" ar="جارٍ الإنهاء…" />
                </span>
              )}
            </div>
            <div className="ws-up-actions">
              {isUploading && (
                <button
                  className="ws-up-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPause()
                  }}
                >
                  <Bi en="Pause" ar="إيقاف مؤقت" />
                </button>
              )}
              {isPaused && (
                <button
                  className="ws-up-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetryPicker()
                  }}
                >
                  <Bi en="Resume" ar="استئناف" />
                </button>
              )}
              {(isUploading || isPaused) && (
                <button
                  className="ws-up-btn danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAbort()
                  }}
                >
                  <Bi en="Abort" ar="إلغاء" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── resume wizard ── */}
      {state.resumable && (
        <div
          className="ws-resume"
          role="region"
          aria-label={lang === 'ar' ? 'استئناف رفع متوقف' : 'Resume interrupted upload'}
        >
          <div className="ws-resume-msg">
            <span className="ws-resume-ic">⏵</span>
            <div>
              <b>
                <Bi en="Interrupted upload found" ar="وجد رفع متوقف" />
              </b>
              <span className="ws-resume-detail">
                {state.resumable.file_name} · {humanBytes(state.resumable.uploaded_bytes)} /{' '}
                {humanBytes(state.resumable.total)} · {state.resumable.parts.length}{' '}
                <Bi en="parts done" ar="أجزاء تمت" />
              </span>
            </div>
          </div>
          <div className="ws-resume-actions">
            <input
              ref={resumeInputRef as RefObject<HTMLInputElement>}
              type="file"
              className="ws-file-input"
              onChange={onResumeFile}
            />
            <button className="ws-up-btn" onClick={() => resumeInputRef.current?.click()}>
              <Bi en="Select same file to resume" ar="اختر نفس الملف للاستئناف" />
            </button>
            <button className="ws-up-btn danger" onClick={onDiscardResumable}>
              <Bi en="Discard" ar="تجاهل" />
            </button>
          </div>
        </div>
      )}

      {/* ── upload error ── */}
      {state.error && state.status === 'error' && (
        <div className="ws-err" role="alert">
          {state.error}
        </div>
      )}
    </>
  )
}