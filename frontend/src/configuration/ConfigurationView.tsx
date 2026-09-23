import { useEffect, useRef, useState } from 'react'
import type { LayerCreate, LayerRead, SetCreate, SetRead, SetUpdate } from '../api/generated'
import { ConfirmDialog } from '../library/ConfirmDialog'
import { errorMessage } from '../library/apiError'
import { useConfiguration, type Configuration } from './useConfiguration'
import { SetSettings } from './SetSettings'
import { canonicalName, nameError } from './name'

type Selection = { kind: 'layer' | 'set'; id: string }

const playbackModeLabels: Record<LayerRead['playback_mode'], string> = {
  single: 'Single set',
  multiset: 'Multiset',
  self_stacking: 'Self-stacking',
}

function volumeError(volume: string) {
  if (!/^(0|[1-9]\d*)$/.test(volume) || Number(volume) > 100) return 'Volume must be a whole number from 0 to 100.'
  return null
}

function resolveSelection(configuration: Configuration | null, chosen: Selection | null) {
  const layers = configuration?.layers ?? []
  const layer = chosen?.kind === 'layer'
    ? layers.find((item) => item.id === chosen.id)
    : undefined
  const set = chosen?.kind === 'set'
    ? layers.flatMap((item) => configuration?.setsByLayer[item.id] ?? []).find((item) => item.id === chosen.id)
    : undefined
  if (layer) return { selection: chosen, layer, set: undefined, parent: undefined }
  if (set) return { selection: chosen, layer: undefined, set, parent: layers.find((item) => item.id === set.layer_id) }
  const first = layers[0]
  return { selection: first ? { kind: 'layer', id: first.id } as Selection : null, layer: first, set: undefined, parent: undefined }
}

export function ConfigurationView() {
  const { configuration, loading, error, refresh, refreshRevision, reordering, mutating, moveLayer, moveSet, saveLayer, removeLayer, saveSet, removeSet } = useConfiguration()
  const [chosen, setChosen] = useState<Selection | null>(null)
  const [creatingLayer, setCreatingLayer] = useState(false)
  const [creatingSetLayer, setCreatingSetLayer] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<LayerRead | null>(null)
  const [deletingSet, setDeletingSet] = useState<SetRead | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const settingsHeading = useRef<HTMLHeadingElement>(null)
  const emptyHeading = useRef<HTMLHeadingElement>(null)

  const layers = configuration?.layers ?? []
  const { selection, layer, set, parent } = resolveSelection(configuration, chosen)
  const selectedKind = selection?.kind
  const selectedId = selection?.id

  useEffect(() => {
    if (chosen && (selectedKind !== chosen.kind || selectedId !== chosen.id)) {
      (selectedId ? settingsHeading : emptyHeading).current?.focus()
    }
  }, [chosen, selectedKind, selectedId])

  function select(next: Selection) {
    setCreatingLayer(false)
    setCreatingSetLayer(null)
    setChosen(next)
    setFeedback(null)
    requestAnimationFrame(() => settingsHeading.current?.focus())
  }

  function startCreating() {
    setCreatingLayer(true)
    setCreatingSetLayer(null)
    setFeedback(null)
    requestAnimationFrame(() => settingsHeading.current?.focus())
  }

  async function saveNewSet(body: SetCreate) {
    if (!creatingSetLayer) throw new Error('No Layer selected for the new Set')
    const saved = await saveSet(creatingSetLayer, null, body)
    setChosen({ kind: 'set', id: saved.id })
    setCreatingSetLayer(null)
    setFeedback(`Saved Set ${saved.name}.`)
    return saved
  }

  async function saveExistingSet(selectedSet: SetRead, body: SetUpdate) {
    const saved = await saveSet(selectedSet.layer_id, selectedSet.id, body)
    setFeedback(`Saved Set ${saved.name}.`)
    return saved
  }

  async function confirmDeleteSet() {
    if (!deletingSet || deletingBusy || reordering) return
    setDeletingBusy(true)
    setFeedback(null)
    try {
      const siblings = configuration?.setsByLayer[deletingSet.layer_id] ?? []
      const index = siblings.findIndex((item) => item.id === deletingSet.id)
      const neighbor = siblings[index + 1] ?? siblings[index - 1]
      await removeSet(deletingSet.id, deletingSet.layer_id)
      setChosen(neighbor ? { kind: 'set', id: neighbor.id } : { kind: 'layer', id: deletingSet.layer_id })
      setFeedback(`Deleted Set ${deletingSet.name}.`)
      setDeletingSet(null)
      requestAnimationFrame(() => settingsHeading.current?.focus())
    } catch (cause) {
      setFeedback(errorMessage(cause, 'Could not delete Set'))
      setDeletingSet(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy || reordering) return
    setDeletingBusy(true)
    setFeedback(null)
    try {
      const index = layers.findIndex((item) => item.id === deleting.id)
      const neighbor = layers[index + 1] ?? layers[index - 1]
      await removeLayer(deleting.id)
      setChosen(neighbor ? { kind: 'layer', id: neighbor.id } : null)
      setDeleting(null)
      setFeedback(`Deleted Layer ${deleting.name}.`)
      requestAnimationFrame(() => (neighbor ? settingsHeading : emptyHeading).current?.focus())
    } catch (cause) {
      setFeedback(errorMessage(cause, 'Could not delete Layer'))
      setDeleting(null)
    } finally {
      setDeletingBusy(false)
    }
  }

  async function reorder(kind: 'layer' | 'set', id: string, offset: -1 | 1, layerId?: string) {
    setReorderError(null)
    if (!chosen && selection) setChosen(selection)
    try {
      if (kind === 'layer') await moveLayer(id, offset)
      else if (layerId) await moveSet(layerId, id, offset)
    } catch (cause) {
      setReorderError(errorMessage(cause, `Could not reorder ${kind === 'layer' ? 'Layers' : 'Sets'}`))
    }
  }

  if (!configuration && loading) return <p role="status">Loading Layers &amp; Sets…</p>
  if (!configuration && error) return <div role="alert"><p>{error}</p><button onClick={() => void refresh()}>Try again</button></div>

  return (
    <section aria-label="Layers and Sets configuration">
      <div className="configuration-toolbar">
        <p>Organize your Layers and Sets for the Session.</p>
        <button onClick={() => void refresh()} disabled={loading || reordering || mutating}>Refresh</button>
      </div>
      {loading && <p role="status">Refreshing Layers &amp; Sets…</p>}
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {reorderError && <p role="alert">{reorderError}</p>}
      {layers.length === 0 && !creatingLayer ? (
        <div className="configuration-empty">
          <h2 ref={emptyHeading} tabIndex={-1}>No Layers yet</h2>
          <p>Create your first Layer to organize Sets.</p>
          <button type="button" disabled={reordering} onClick={startCreating}>Create first Layer</button>
        </div>
      ) : (
        <div className="configuration-grid">
          <section className="configuration-outline" aria-labelledby="outline-heading">
            <h2 id="outline-heading">Outline</h2>
            <ul>
              {layers.map((item, layerIndex) => (
                <li key={item.id}>
                  <div className="outline-row">
                    <button type="button" className="outline-item" aria-current={!creatingLayer && !creatingSetLayer && selection?.kind === 'layer' && selection.id === item.id ? 'true' : undefined} onClick={() => select({ kind: 'layer', id: item.id })}>{item.name}</button>
                    <div className="outline-move">
                      <button type="button" aria-label={`Move Layer ${item.name} up`} title="Move Layer up" disabled={reordering || mutating || loading || layerIndex === 0} onClick={() => void reorder('layer', item.id, -1)}>↑</button>
                      <button type="button" aria-label={`Move Layer ${item.name} down`} title="Move Layer down" disabled={reordering || mutating || loading || layerIndex === layers.length - 1} onClick={() => void reorder('layer', item.id, 1)}>↓</button>
                    </div>
                  </div>
                  {(configuration?.setsByLayer[item.id]?.length ?? 0) > 0 ? (
                    <ul>
                      {configuration?.setsByLayer[item.id]?.map((child, setIndex, siblings) => (
                        <li key={child.id}>
                          <div className="outline-row">
                            <button type="button" className="outline-item" aria-label={child.name} aria-describedby={child.tags.length === 0 ? `set-tagless-${child.id}` : undefined} aria-current={!creatingLayer && !creatingSetLayer && selection?.kind === 'set' && selection.id === child.id ? 'true' : undefined} onClick={() => select({ kind: 'set', id: child.id })}>{child.name}{child.tags.length === 0 && <small id={`set-tagless-${child.id}`} className="outline-tagless">No Tags selected</small>}</button>
                            <div className="outline-move">
                              <button type="button" aria-label={`Move Set ${child.name} up`} title="Move Set up" disabled={reordering || mutating || loading || setIndex === 0} onClick={() => void reorder('set', child.id, -1, item.id)}>↑</button>
                              <button type="button" aria-label={`Move Set ${child.name} down`} title="Move Set down" disabled={reordering || mutating || loading || setIndex === siblings.length - 1} onClick={() => void reorder('set', child.id, 1, item.id)}>↓</button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="outline-empty">No Sets in this Layer</p>}
                  <button type="button" disabled={reordering} onClick={() => { setCreatingLayer(false); setCreatingSetLayer(item.id); setFeedback(null); requestAnimationFrame(() => settingsHeading.current?.focus()) }}>Add Set to {item.name}</button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={reordering} onClick={startCreating}>Add Layer</button>
          </section>
          <section className="configuration-settings" aria-labelledby="settings-heading">
            <p className="settings-context">{creatingLayer ? 'New Layer' : creatingSetLayer ? `${layers.find((item) => item.id === creatingSetLayer)?.name ?? 'Layer'} / New Set` : set ? `${parent?.name ?? 'Layer'} / Set` : 'Layer'}</p>
            <h2 id="settings-heading" ref={settingsHeading} tabIndex={-1}>{creatingLayer ? 'New Layer' : creatingSetLayer ? 'New Set' : set?.name ?? layer?.name}</h2>
            {creatingLayer ? (
              <LayerSettings key="new" blocked={reordering} onSave={async (body) => {
                const saved = await saveLayer(null, body)
                setChosen({ kind: 'layer', id: saved.id })
                setCreatingLayer(false)
                setFeedback(`Saved Layer ${saved.name}.`)
              }} onCancel={() => setCreatingLayer(false)} />
            ) : creatingSetLayer ? <SetSettings key={`new:${creatingSetLayer}`} blocked={reordering} tags={configuration?.tags ?? []}
              onSave={saveNewSet} onCancel={() => setCreatingSetLayer(null)} />
              : set ? <SetSettings key={`${set.id}:${refreshRevision}`} blocked={reordering} set={set} tags={configuration?.tags ?? []}
                onSave={(body) => saveExistingSet(set, body)} onDelete={() => setDeletingSet(set)} /> : layer ? (
              <LayerSettings key={`${layer.id}:${layer.name}:${layer.playback_mode}:${layer.volume}`} blocked={reordering} layer={layer}
                onSave={async (body) => {
                  const saved = await saveLayer(layer.id, body)
                  setFeedback(`Saved Layer ${saved.name}.`)
                }} onDelete={() => setDeleting(layer)} />
            ) : null}
          </section>
        </div>
      )}
      <ConfirmDialog open={!!deleting} title={`Delete Layer ${deleting?.name ?? ''}?`}
        message={`This will also delete ${configuration?.setsByLayer[deleting?.id ?? '']?.length ?? 0} Sets. Library Sounds are unaffected.`}
        confirmLabel={deletingBusy ? 'Deleting…' : 'Delete Layer'} busy={deletingBusy || reordering}
        onConfirm={() => void confirmDelete()} onCancel={() => { if (!deletingBusy) setDeleting(null) }} />
      <ConfirmDialog open={!!deletingSet} title={`Delete Set ${deletingSet?.name ?? ''}?`}
        message="Matching Library Sounds are unaffected. This cannot be undone."
        confirmLabel={deletingBusy ? 'Deleting…' : 'Delete Set'} busy={deletingBusy || reordering}
        onConfirm={() => void confirmDeleteSet()} onCancel={() => { if (!deletingBusy) setDeletingSet(null) }} />
    </section>
  )
}

function LayerSettings({ layer, blocked, onSave, onCancel, onDelete }: {
  layer?: LayerRead
  blocked: boolean
  onSave: (body: LayerCreate) => Promise<void>
  onCancel?: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(layer?.name ?? '')
  const [mode, setMode] = useState<LayerRead['playback_mode']>(layer?.playback_mode ?? 'single')
  const [volume, setVolume] = useState(String(layer?.volume ?? 80))
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const invalidName = nameError(name, 'Layer')
  const invalidVolume = volumeError(volume)

  function reset() {
    setName(layer?.name ?? '')
    setMode(layer?.playback_mode ?? 'single')
    setVolume(String(layer?.volume ?? 80))
    setTouched(false)
    setFailure(null)
    onCancel?.()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || blocked) return
    setTouched(true)
    setFailure(null)
    if (invalidName || invalidVolume) return
    setBusy(true)
    try {
      await onSave({ name: canonicalName(name), playback_mode: mode, volume: Number(volume) })
    } catch (cause) {
      setFailure(errorMessage(cause, 'Could not save Layer'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="layer-settings" onSubmit={(event) => void save(event)} noValidate>
      <label htmlFor="layer-name">Name</label>
      <input id="layer-name" value={name} aria-invalid={touched && !!invalidName} aria-describedby={touched && invalidName ? 'layer-name-error' : undefined} onChange={(event) => { setName(event.target.value); setTouched(true) }} />
      {touched && invalidName && <p id="layer-name-error" className="field-error">{invalidName}</p>}
      <label htmlFor="layer-mode">Playback mode</label>
      <select id="layer-mode" value={mode} onChange={(event) => setMode(event.target.value as LayerRead['playback_mode'])}>
        {Object.entries(playbackModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor="layer-volume">Volume</label>
      <input id="layer-volume" type="text" inputMode="numeric" value={volume} aria-invalid={touched && !!invalidVolume} aria-describedby={touched && invalidVolume ? 'layer-volume-error' : undefined} onChange={(event) => { setVolume(event.target.value); setTouched(true) }} />
      {touched && invalidVolume && <p id="layer-volume-error" className="field-error">{invalidVolume}</p>}
      {failure && <p role="alert">{failure}</p>}
      <div className="layer-actions">
        <button type="submit" disabled={busy || blocked}>{busy ? 'Saving…' : 'Save configuration'}</button>
        <button type="button" disabled={busy} onClick={reset}>Cancel changes</button>
        {onDelete && <button type="button" disabled={busy || blocked} className="danger" onClick={onDelete}>Delete Layer</button>}
      </div>
    </form>
  )
}
