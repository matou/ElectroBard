import { useState } from 'react'
import type { SoundRead } from '../api/generated'

export interface AddSoundBarProps {
  onAddFile: (file: File) => Promise<SoundRead>
  onAddYoutube: (url: string) => Promise<{ sound: SoundRead; embedWarning: string | null }>
}

// Accepted upload formats (PRD-01 "Upload formats") — mirrors the backend's extension
// allowlist so the OS file picker filters up front; the server remains the source of
// truth and re-validates regardless.
const ACCEPTED_EXTENSIONS = '.mp3,.ogg,.wav,.m4a,.flac'

// Add-file and add-YouTube controls (#42 build item). Both are a single network call
// each — the YouTube add-time embeddability check is a heuristic baked into that one
// call (api-contract "Sounds"), so a warned video is already saved by the time this
// shows its warning; "Add anyway" just dismisses the notice rather than triggering a
// second request (Q4 net: "blocked ≡ later-errored, one path").
export function AddSoundBar({ onAddFile, onAddYoutube }: AddSoundBarProps) {
  const [fileError, setFileError] = useState<string | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [embedWarning, setEmbedWarning] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after an error
    if (!file) {
      return
    }
    setFileError(null)
    try {
      await onAddFile(file)
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not upload sound')
    }
  }

  async function submitYoutube() {
    const url = youtubeUrl.trim()
    if (!url) {
      return
    }
    setYoutubeError(null)
    try {
      const { embedWarning: warning } = await onAddYoutube(url)
      setYoutubeUrl('')
      setEmbedWarning(warning)
    } catch (err) {
      setYoutubeError(err instanceof Error ? err.message : 'Could not add YouTube sound')
    }
  }

  return (
    <div className="add-sound-bar">
      <div className="addbar">
        <label className="btn-add">
          ⭱ Add file
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            aria-label="Add file"
            className="file-input-hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </label>
        <div className="yt-inline">
          <input
            placeholder="Paste a YouTube video URL…"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitYoutube()
              }
            }}
          />
          <button type="button" className="btn-add" onClick={() => void submitYoutube()}>
            ＋ Add YouTube
          </button>
        </div>
      </div>
      {fileError && <p className="add-sound-error">{fileError}</p>}
      {youtubeError && <p className="add-sound-error">{youtubeError}</p>}
      {embedWarning && (
        <div className="warnbox">
          <span>⚠</span>
          <div>
            {embedWarning}
            <div>
              <button type="button" onClick={() => setEmbedWarning(null)}>
                Add anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
