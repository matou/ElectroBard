import { useEffect, useState } from 'react'
import { getSetSounds, type SetCreate, type SetRead, type SetUpdate, type SoundRead, type TagRead } from '../api/generated'
import { apiErrorMessage, errorMessage } from '../library/apiError'
import { canonicalName, nameError } from './name'

type CommonProps = {
  tags: TagRead[]
  blocked: boolean
  onCancel?: () => void
  onDelete?: () => void
}

type Props = CommonProps & (
  | { set?: undefined; onSave: (body: SetCreate) => Promise<SetRead | void> }
  | { set: SetRead; onSave: (body: SetUpdate) => Promise<SetRead | void> }
)

export function SetSettings(props: Props) {
  const { set, tags, blocked, onCancel, onDelete } = props
  const [name, setName] = useState(set?.name ?? '')
  const [tagIds, setTagIds] = useState<string[]>(set?.tags.map((tag) => tag.id) ?? [])
  const [loop, setLoop] = useState(set?.loop ?? false)
  const [shuffle, setShuffle] = useState(set?.shuffle ?? false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [sounds, setSounds] = useState<SoundRead[] | null>(null)
  const [resolvedFor, setResolvedFor] = useState<SetRead | null>(null)
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const invalidName = nameError(name, 'Set')

  // The Set object changes on a successful save or workspace refresh.
  useEffect(() => {
    if (!set) return
    let active = true
    void getSetSounds({ path: { set_id: set.id } }).then((result) => {
      if (!active) return
      setResolvedFor(set)
      if (result.error || !result.data) {
        setMembershipError(apiErrorMessage(result.error, 'Could not load resolved membership'))
        setSounds(null)
      } else {
        setMembershipError(null)
        setSounds(result.data)
      }
    }).catch((cause) => {
      if (active) {
        setResolvedFor(set)
        setMembershipError(errorMessage(cause, 'Could not load resolved membership'))
        setSounds(null)
      }
    })
    return () => { active = false }
  }, [set])

  function reset() {
    setName(set?.name ?? '')
    setTagIds(set?.tags.map((tag) => tag.id) ?? [])
    setLoop(set?.loop ?? false)
    setShuffle(set?.shuffle ?? false)
    setTouched(false)
    setFailure(null)
    onCancel?.()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || blocked) return
    setTouched(true)
    setFailure(null)
    if (invalidName) return
    const canonical = canonicalName(name)
    setBusy(true)
    try {
      let saved: SetRead | void
      if (props.set) {
        const body: SetUpdate = {}
        if (canonical !== props.set.name) body.name = canonical
        if (loop !== props.set.loop) body.loop = loop
        if (shuffle !== props.set.shuffle) body.shuffle = shuffle
        const prior = props.set.tags.map((tag) => tag.id)
        if (tagIds.length !== prior.length || tagIds.some((id) => !prior.includes(id))) body.tagIds = tagIds
        saved = await props.onSave(body)
      } else {
        saved = await props.onSave({ name: canonical, tagIds, loop, shuffle })
      }
      if (saved) {
        setName(saved.name)
        setTagIds(saved.tags.map((tag) => tag.id))
        setLoop(saved.loop)
        setShuffle(saved.shuffle)
      }
      setTouched(false)
    } catch (cause) {
      setFailure(errorMessage(cause, 'Could not save Set'))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <form className="layer-settings" onSubmit={(event) => void save(event)} noValidate>
      <label htmlFor="set-name">Name</label>
      <input id="set-name" value={name} aria-invalid={touched && !!invalidName} aria-describedby={touched && invalidName ? 'set-name-error' : undefined} onChange={(event) => { setName(event.target.value); setTouched(true) }} />
      {touched && invalidName && <p id="set-name-error" className="field-error">{invalidName}</p>}
      <fieldset className="set-tags">
        <legend>Tags</legend>
        {tags.length ? tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => setTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} />{tag.name}</label>) : <p>No Tags available. Add Tags in the Sound Library.</p>}
      </fieldset>
      <label className="set-toggle"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />Loop</label>
      <label className="set-toggle"><input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />Shuffle</label>
      {failure && <p role="alert">{failure}</p>}
      <div className="layer-actions">
        <button type="submit" disabled={busy || blocked}>{busy ? 'Saving…' : 'Save configuration'}</button>
        <button type="button" disabled={busy} onClick={reset}>Cancel changes</button>
        {onDelete && <button type="button" disabled={busy || blocked} className="danger" onClick={onDelete}>Delete Set</button>}
      </div>
    </form>
    <section className="set-membership" aria-label="Resolved membership">
      <h3>Resolved membership</h3>
      <p>Sounds matching any selected tag (OR).</p>
      {!set ? <p>Save configuration to see resolved Sounds.</p> : <>
        {resolvedFor !== set && <p role="status">Loading resolved membership…</p>}
        {resolvedFor === set && membershipError && <p role="alert">{membershipError}</p>}
        {resolvedFor === set && sounds && <>
          <p>{sounds.length} {sounds.length === 1 ? 'Sound' : 'Sounds'}</p>
          {set.tags.length === 0 ? <p>No Tags selected. Select Tags to include Sounds.</p>
            : sounds.length === 0 ? <p>No matching Sounds. Tag Sounds in the Sound Library or change the selection.</p>
              : <ol>{sounds.map((sound) => <li key={sound.id}>{sound.name} — {sound.kind === 'file' ? 'Uploaded file' : 'YouTube'}{sound.is_errored && ' — Errored'}</li>)}</ol>}
        </>}
      </>}
    </section>
  </>
}
