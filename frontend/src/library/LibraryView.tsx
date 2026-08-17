import { useState } from 'react'
import { AddSoundBar } from './AddSoundBar'
import { SoundRow } from './SoundRow'
import { errorMessage } from './apiError'
import { useLibrary } from './useLibrary'

// The Sound Library page (#42, "Catalog rows" direction — prototype #21/PR #28):
// add-file/add-YouTube controls above a table of SoundRows, all driven by useLibrary.
// Per-row mutation failures (rename/tag/delete) surface as one page-level message —
// each row's own optimistic state already reverted by the time the hook's promise
// rejects, so there's nothing row-local left to roll back.
export function LibraryView() {
  const { sounds, tags, loadError, addFile, addYoutube, renameSound, setSoundTags, deleteSound, createTag } =
    useLibrary()
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleRename(id: string, name: string) {
    try {
      await renameSound(id, name)
      setActionError(null)
    } catch (err) {
      setActionError(errorMessage(err,'Could not rename sound'))
    }
  }

  async function handleTagsChange(id: string, tagIds: string[]) {
    try {
      await setSoundTags(id, tagIds)
      setActionError(null)
    } catch (err) {
      setActionError(errorMessage(err,'Could not update tags'))
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSound(id)
      setActionError(null)
    } catch (err) {
      setActionError(errorMessage(err,'Could not delete sound'))
    }
  }

  if (sounds === null) {
    return <p>Loading your library…</p>
  }

  return (
    <section className="catalog">
      <AddSoundBar onAddFile={addFile} onAddYoutube={addYoutube} />
      {(loadError ?? actionError) && <p className="add-sound-error">{loadError ?? actionError}</p>}
      {sounds.length === 0 ? (
        <p>Your library is empty. Upload a sound to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Sound</th>
              <th>Tags</th>
              <th className="right">Duration</th>
              <th className="right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sounds.map((sound) => (
              <SoundRow
                key={sound.id}
                sound={sound}
                allTags={tags}
                onRename={(name) => void handleRename(sound.id, name)}
                onTagsChange={(tagIds) => void handleTagsChange(sound.id, tagIds)}
                onCreateTag={createTag}
                onDelete={() => void handleDelete(sound.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
