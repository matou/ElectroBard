import { useEffect, useRef, useState } from 'react'
import type { LayerRead, SetRead } from '../api/generated'
import { useConfiguration, type Configuration } from './useConfiguration'

type Selection = { kind: 'layer' | 'set'; id: string }

const playbackModeLabels: Record<LayerRead['playback_mode'], string> = {
  single: 'Single set',
  multiset: 'Multiset',
  self_stacking: 'Self-stacking',
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
  const { configuration, loading, error, refresh } = useConfiguration()
  const [chosen, setChosen] = useState<Selection | null>(null)
  const settingsHeading = useRef<HTMLHeadingElement>(null)
  const emptyHeading = useRef<HTMLHeadingElement>(null)

  const layers = configuration?.layers ?? []
  const { selection, layer, set, parent } = resolveSelection(configuration, chosen)
  const selectedKind = selection?.kind
  const selectedId = selection?.id

  // A refreshed collection may no longer contain the selected item. Focus the
  // fallback heading so keyboard users know where the selection moved.
  useEffect(() => {
    if (chosen && (selectedKind !== chosen.kind || selectedId !== chosen.id)) {
      (selectedId ? settingsHeading : emptyHeading).current?.focus()
    }
  }, [chosen, selectedKind, selectedId])

  function select(next: Selection) {
    setChosen(next)
    requestAnimationFrame(() => settingsHeading.current?.focus())
  }

  if (!configuration && loading) return <p role="status">Loading Layers &amp; Sets…</p>
  if (!configuration && error) return <div role="alert"><p>{error}</p><button onClick={() => void refresh()}>Try again</button></div>

  return (
    <section aria-label="Layers and Sets configuration">
      <div className="configuration-toolbar">
        <p>Organize your Layers and Sets for the Session.</p>
        <button onClick={() => void refresh()} disabled={loading}>Refresh</button>
      </div>
      {loading && <p role="status">Refreshing Layers &amp; Sets…</p>}
      {error && <p role="alert">{error}</p>}
      {layers.length === 0 ? (
        <div className="configuration-empty">
          <h2 ref={emptyHeading} tabIndex={-1}>No Layers yet</h2>
          <p>Create your first Layer to organize Sets.</p>
          <button type="button" disabled title="Layer creation is coming soon">Create first Layer — coming soon</button>
        </div>
      ) : (
        <div className="configuration-grid">
          <section className="configuration-outline" aria-labelledby="outline-heading">
            <h2 id="outline-heading">Outline</h2>
            <ul>
              {layers.map((item) => (
                <li key={item.id}>
                  <button type="button" className="outline-item" aria-current={selection?.kind === 'layer' && selection.id === item.id ? 'true' : undefined} onClick={() => select({ kind: 'layer', id: item.id })}>{item.name}</button>
                  {(configuration?.setsByLayer[item.id]?.length ?? 0) > 0 ? (
                    <ul>
                      {configuration?.setsByLayer[item.id]?.map((child) => (
                        <li key={child.id}><button type="button" className="outline-item" aria-current={selection?.kind === 'set' && selection.id === child.id ? 'true' : undefined} onClick={() => select({ kind: 'set', id: child.id })}>{child.name}</button></li>
                      ))}
                    </ul>
                  ) : <p className="outline-empty">No Sets in this Layer</p>}
                </li>
              ))}
            </ul>
          </section>
          <section className="configuration-settings" aria-labelledby="settings-heading">
            <p className="settings-context">{set ? `${parent?.name ?? 'Layer'} / Set` : 'Layer'}</p>
            <h2 id="settings-heading" ref={settingsHeading} tabIndex={-1}>{set?.name ?? layer?.name}</h2>
            {set ? <SetDetails set={set} /> : layer ? <LayerDetails layer={layer} /> : null}
          </section>
        </div>
      )}
    </section>
  )
}

function LayerDetails({ layer }: { layer: LayerRead }) {
  return <dl className="settings-details"><dt>Name</dt><dd>{layer.name}</dd><dt>Playback mode</dt><dd>{playbackModeLabels[layer.playback_mode]}</dd><dt>Volume</dt><dd>{layer.volume}%</dd></dl>
}

function SetDetails({ set }: { set: SetRead }) {
  return <dl className="settings-details"><dt>Name</dt><dd>{set.name}</dd><dt>Tags</dt><dd>{set.tags.length ? set.tags.map((tag) => tag.name).join(', ') : 'No tags selected'}</dd><dt>Loop</dt><dd>{set.loop ? 'On' : 'Off'}</dd><dt>Shuffle</dt><dd>{set.shuffle ? 'On' : 'Off'}</dd></dl>
}
