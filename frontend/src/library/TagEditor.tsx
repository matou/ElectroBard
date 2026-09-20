import { useId, useState } from 'react'
import type { TagRead } from '../api/generated'
import { errorMessage } from './apiError'

export interface TagEditorProps {
  /** The tags currently assigned to this sound. */
  tags: TagRead[]
  /** Every tag the GM has defined, used to match a typed name against an existing tag. */
  allTags: TagRead[]
  /** Called with the full replacement tag-id list (PATCH's full-replace contract). */
  onTagsChange: (tagIds: string[]) => void
  /** Called when the typed name matches no existing tag; must resolve to the new tag. */
  onCreateTag: (name: string) => Promise<TagRead>
}

// Per-row tag assignment (#42 build item). Assigning always sends the *whole* tag-id
// list (Q4's single membership-recompute write path via `PATCH /api/sounds/{id}`), so
// this component never emits an add/remove delta — only full next-state lists.
export function TagEditor({ tags, allTags, onTagsChange, onCreateTag }: TagEditorProps) {
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const datalistId = useId()

  function removeTag(id: string) {
    onTagsChange(tags.filter((t) => t.id !== id).map((t) => t.id))
  }

  async function submitDraft() {
    const name = draftName.trim()
    if (!name) {
      return
    }

    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      onTagsChange([...new Set([...tags.map((t) => t.id), existing.id])])
      setDraftName('')
      setAdding(false)
      setError(null)
      return
    }

    try {
      const created = await onCreateTag(name)
      onTagsChange([...tags.map((t) => t.id), created.id])
      setDraftName('')
      setAdding(false)
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Could not create tag'))
    }
  }

  return (
    <div className="tag-editor">
      <ul className="tag-chips">
        {tags.map((tag) => (
          <li key={tag.id} className="tag-chip">
            {tag.name}
            <button type="button" aria-label={`Remove ${tag.name}`} onClick={() => removeTag(tag.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="tag-editor-add">
          <input
            list={datalistId}
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitDraft()
              } else if (e.key === 'Escape') {
                setAdding(false)
                setDraftName('')
                setError(null)
              }
            }}
          />
          <datalist id={datalistId}>
            {allTags
              .filter((t) => !tags.some((assigned) => assigned.id === t.id))
              .map((t) => (
                <option key={t.id} value={t.name} />
              ))}
          </datalist>
          <button type="button" onClick={() => void submitDraft()}>
            Add
          </button>
          {error && <span className="tag-editor-error">{error}</span>}
        </div>
      ) : (
        <button type="button" className="tagadd" onClick={() => setAdding(true)}>
          + tag
        </button>
      )}
    </div>
  )
}
