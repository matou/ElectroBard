import { useCallback, useEffect, useState } from 'react'
import { listLayers, listSets, type LayerRead, type SetRead } from '../api/generated'
import { Program, type ProgramSnapshot } from './Program'
import './SessionView.css'

interface Props { program: Program }

export function SessionView({ program }: Props) {
  const [layers, setLayers] = useState<LayerRead[]>([])
  const [sets, setSets] = useState<SetRead[]>([])
  const [snapshot, setSnapshot] = useState<ProgramSnapshot>(() => program.getSnapshot())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const layerResult = await listLayers()
      if (!layerResult.data) throw new Error('Could not load Layers')
      const orderedLayers = [...layerResult.data].sort((a, b) => a.position - b.position)
      const results = await Promise.all(orderedLayers.map((layer) => listSets({ path: { layer_id: layer.id } })))
      if (results.some((result) => !result.data)) throw new Error('Could not load Sets')
      const orderedSets = results.flatMap((result) => [...result.data!].sort((a, b) => a.position - b.position))
      setLayers(orderedLayers)
      setSets(orderedSets)
      program.applySavedConfiguration(orderedLayers, orderedSets)
      void program.prepareSets(orderedSets)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Session')
    } finally {
      setLoading(false)
    }
  }, [program])

  useEffect(() => {
    const unsubscribe = program.subscribe(() => setSnapshot(program.getSnapshot()))
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false; unsubscribe() }
  }, [load, program])

  if (loading) return <p role="status">Loading Session…</p>
  if (error) return <div role="alert">{error} <button onClick={() => void load()}>Retry Session</button></div>
  const notices = sets.filter((set) => snapshot.tiles[set.id]?.feedback)

  return <div className="session">
    {layers.length === 0 && <p>No Layers yet. Create a Layer in Layers &amp; Sets.</p>}
    {layers.map((layer) => <section className="session-rack" key={layer.id} aria-label={`${layer.name} Layer`}>
      <h2>{layer.name}</h2>
      <div className="session-tiles">
        {sets.filter((set) => set.layer_id === layer.id).map((set) => {
          const tile = snapshot.tiles[set.id] ?? { status: 'Stopped', count: 0, blockedCount: 0, feedback: null }
          const stacking = layer.playback_mode === 'self_stacking'
          const active = tile.count > 0
          const action = stacking || !active ? 'Trigger' : 'Stop'
          return <div className="session-tile" key={set.id}>
            <button className="session-trigger" aria-label={`${action} ${set.name} in ${layer.name}`} onClick={() => program.triggerSet(layer.id, set.id)}>
              <strong>{set.name}</strong>
              <span aria-live="polite">{tile.status}</span>
              {stacking && active && <span>×{tile.count}</span>}
            </button>
            {stacking && active && <button onClick={() => program.stopSet(layer.id, set.id)} aria-label={`Stop all instances of ${set.name} in ${layer.name}`}>Stop this Set</button>}
            {tile.blockedCount > 0 && <button onClick={() => program.retryBlockedSet(layer.id, set.id)} aria-label={`Retry audio for ${set.name} in ${layer.name}`}>Retry audio{tile.status === 'Playing' ? ` (${tile.blockedCount} blocked)` : ''}</button>}
            {tile.feedback && <span className="session-feedback" role="status">{tile.feedback.startsWith('No playable Sounds') ? 'No playable Sounds' : 'Playback issue'}</span>}
          </div>
        })}
      </div>
    </section>)}
    {notices.length > 0 &&
      <aside className="session-notices" aria-label="Session notices">
        <h2>Session notices</h2>
        {notices.map((set) =>
          <p key={set.id}>{set.name}: {snapshot.tiles[set.id].feedback}</p>)}
      </aside>}
  </div>
}
