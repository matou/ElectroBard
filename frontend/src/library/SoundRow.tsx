import { useState } from 'react'
import type { SoundRead, TagRead } from '../api/generated'
import type { PlayerStatus } from '../audio/playerStatus'
import { ConfirmDialog } from './ConfirmDialog'
import { formatDuration } from './formatDuration'
import { TagEditor } from './TagEditor'

export interface SoundRowProps {
  sound: SoundRead
  /** Every tag the GM has defined — passed through to this row's TagEditor. */
  allTags: TagRead[]
  /** Non-null only while this row is the library's one active preview (#43). */
  previewStatus: PlayerStatus | null
  previewProgressSeconds: number
  onPreviewPlay: () => void
  onPreviewStop: () => void
  onRename: (name: string) => void
  onTagsChange: (tagIds: string[]) => void
  onCreateTag: (name: string) => Promise<TagRead>
  onDelete: () => void
}

// One catalog row (#42). The preview control plays/stops a single sound via the
// AudioSourcePlayer seam (#43, ADR-0007) — LibraryView owns the one active player and
// passes this row its status only while it's the active preview. A `previewStatus.state
// === 'error'` here is a session-local, transient/persistent-classified failure and is
// distinct from `sound.is_errored`, which M1 never sets (the writer is M3, #25) — so the
// two error displays never appear for the same row at the same time.
// Errored display is read-only in M1 (api-contract "Errored sounds"): "↻ Recheck" is
// rendered but inert, since M1 never sets `is_errored` and the recheck write path is M3.
export function SoundRow({
  sound,
  allTags,
  previewStatus,
  previewProgressSeconds,
  onPreviewPlay,
  onPreviewStop,
  onRename,
  onTagsChange,
  onCreateTag,
  onDelete,
}: SoundRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(sound.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function startRename() {
    setDraftName(sound.name)
    setRenaming(true)
  }

  function commitRename() {
    const name = draftName.trim()
    setRenaming(false)
    if (name && name !== sound.name) {
      onRename(name)
    }
  }

  return (
    <tr className={sound.is_errored ? 'sound-row errored' : 'sound-row'}>
      <td className="cell-preview">
        {sound.is_errored ? (
          <span className="errored-indicator" title="Errored — can't preview">
            ✕ Errored
          </span>
        ) : (
          <>
            {previewStatus?.state === 'playing' || previewStatus?.state === 'loading' ? (
              <button type="button" className="ico stop" onClick={onPreviewStop}>
                ■ Stop
              </button>
            ) : (
              <button type="button" className="ico play" onClick={onPreviewPlay}>
                ▶ Play
              </button>
            )}
            {previewStatus && (previewStatus.state === 'loading' || previewStatus.state === 'playing') && (
              <div className="preview-time">
                {formatDuration(previewProgressSeconds)}
                {sound.duration_seconds !== null ? ` / ${formatDuration(sound.duration_seconds)}` : ''}
              </div>
            )}
            {previewStatus?.state === 'error' && (
              <div className="preview-error">⚠ {previewStatus.errorDetail}</div>
            )}
          </>
        )}
      </td>
      <td className="cell-title">
        <span className={`sigil ${sound.kind}`} title={sound.kind === 'file' ? 'Uploaded file' : 'YouTube link'} />
        {renaming ? (
          <input
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                setRenaming(false)
              }
            }}
          />
        ) : (
          <>
            <span className="title">{sound.name}</span>
            <button type="button" className="ico" onClick={startRename} aria-label="Rename">
              ✎
            </button>
          </>
        )}
        {sound.is_errored && (
          <div className="errbar">
            <span className="why">{sound.error_detail}</span>
            <button type="button" className="ico" disabled title="Recheck lands in M3">
              ↻ Recheck
            </button>
          </div>
        )}
      </td>
      <td className="cell-tags">
        <TagEditor
          tags={sound.tags}
          allTags={allTags}
          onTagsChange={onTagsChange}
          onCreateTag={onCreateTag}
        />
      </td>
      <td className="cell-duration right">
        {sound.is_errored ? (
          <span className="pill-err">Unavailable</span>
        ) : (
          <span className="dur">{formatDuration(sound.duration_seconds)}</span>
        )}
      </td>
      <td className="cell-actions right">
        <button
          type="button"
          className="ico danger"
          aria-label="Delete"
          onClick={() => setConfirmingDelete(true)}
        >
          🗑
        </button>
        <ConfirmDialog
          open={confirmingDelete}
          title={`Delete "${sound.name}"?`}
          message="This removes it from every set it belongs to. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirmingDelete(false)
            onDelete()
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      </td>
    </tr>
  )
}
