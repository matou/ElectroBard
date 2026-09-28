import { getSetSounds, type LayerRead, type SetRead, type SoundRead } from '../api/generated'
import type { AudioSourcePlayer } from '../audio/AudioSourcePlayer'
import { createAudioSourcePlayer } from '../audio/createAudioSourcePlayer'

type TileStatus = 'Starting' | 'Playing' | 'Blocked' | 'Stopped'
export interface TileSnapshot {
  status: TileStatus
  count: number
  blockedCount: number
  feedback: string | null
}
export interface ProgramSnapshot {
  tiles: Readonly<Record<string, TileSnapshot>>
}

type Instance = {
  layerId: string
  setId: string
  status: TileStatus
  active: boolean
  player?: AudioSourcePlayer
  unsubscribe?: () => void
}

export class Program {
  private readonly loadMembership: (setId: string) => Promise<SoundRead[]>
  private readonly makePlayer: (sound: SoundRead) => AudioSourcePlayer
  private layers: LayerRead[] = []
  private sets = new Map<string, SetRead>()
  private instances: Instance[] = []
  private feedback = new Map<string, string>()
  private membership = new Map<string, SoundRead[]>()
  private listeners = new Set<() => void>()
  private disposed = false

  constructor(
    loadMembership: (setId: string) => Promise<SoundRead[]> = async (setId) => {
      const result = await getSetSounds({ path: { set_id: setId } })
      if (!result.data) throw new Error('Could not load Set Sounds. Tap the Set to retry.')
      return result.data
    },
    makePlayer: (sound: SoundRead) => AudioSourcePlayer = createAudioSourcePlayer,
  ) {
    this.loadMembership = loadMembership
    this.makePlayer = makePlayer
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): ProgramSnapshot {
    const tiles: Record<string, TileSnapshot> = {}
    for (const set of this.sets.values()) {
      const active = this.instances.filter((instance) => instance.active && instance.setId === set.id)
      const status: TileStatus = active.some((instance) => instance.status === 'Playing') ? 'Playing'
        : active.some((instance) => instance.status === 'Starting') ? 'Starting'
          : active.some((instance) => instance.status === 'Blocked') ? 'Blocked' : 'Stopped'
      tiles[set.id] = {
        status,
        count: active.length,
        blockedCount: active.filter((instance) => instance.status === 'Blocked').length,
        feedback: this.feedback.get(set.id) ?? null,
      }
    }
    return { tiles }
  }

  applySavedConfiguration(layers: LayerRead[], sets: SetRead[]): void {
    for (const set of sets) {
      const previous = this.sets.get(set.id)
      if (previous && (JSON.stringify(previous.tags) !== JSON.stringify(set.tags))) this.membership.delete(set.id)
    }
    this.layers = layers
    this.sets = new Map(sets.map((set) => [set.id, set]))
    for (const id of this.membership.keys()) if (!this.sets.has(id)) this.membership.delete(id)
    for (const instance of [...this.instances]) {
      if (!this.layers.some((layer) => layer.id === instance.layerId) || !this.sets.has(instance.setId)) this.end(instance)
    }
    for (const layer of layers) {
      const active = this.instances.filter((instance) => instance.layerId === layer.id)
      if (layer.playback_mode === 'single') for (const instance of active.slice(1)) this.end(instance)
      if (layer.playback_mode === 'multiset') {
        const seen = new Set<string>()
        for (const instance of active) {
          if (seen.has(instance.setId)) this.end(instance)
          else seen.add(instance.setId)
        }
      }
      for (const instance of this.instances) if (instance.layerId === layer.id) instance.player?.setVolume(layer.volume)
    }
    this.emit()
  }

  async prepareSets(sets: SetRead[]): Promise<void> {
    await Promise.all(sets.map(async (set) => {
      try {
        const sounds = await this.loadMembership(set.id)
        if (!this.disposed && this.sets.has(set.id)) this.membership.set(set.id, sounds)
      } catch { /* A trigger can retry this Set's membership request. */ }
    }))
  }

  triggerSet(layerId: string, setId: string): void {
    if (this.disposed) return
    const layer = this.layers.find((item) => item.id === layerId)
    if (!layer || !this.sets.has(setId)) return
    const existing = this.instances.filter((item) => item.active && item.setId === setId)
    if (layer.playback_mode !== 'self_stacking' && existing.length) {
      this.stopSet(layerId, setId)
      return
    }
    if (layer.playback_mode === 'single') {
      for (const instance of [...this.instances]) if (instance.layerId === layerId) this.end(instance)
    }
    this.feedback.delete(setId)
    const instance: Instance = { layerId, setId, status: 'Starting', active: true }
    this.instances.push(instance)
    this.emit()
    // Loading may settle later; the active flag prevents it from starting stopped audio.
    const cached = this.membership.get(setId)
    const begin = (sounds: SoundRead[]) => {
      if (!instance.active || this.disposed) return
      const sound = sounds.find((item) => !item.is_errored)
      if (!sound) {
        this.feedback.set(setId, 'No playable Sounds. Add a Sound to this Set or clear its errors in Sound Library.')
        this.end(instance)
        return
      }
      try {
        const player = this.makePlayer(sound)
        instance.player = player
        instance.unsubscribe = player.subscribe(() => {
          if (!instance.active) return
          const state = player.status.state
          if (state === 'ended' || state === 'error' || state === 'stopped') {
            if (state === 'error') this.feedback.set(setId, `Could not play ${sound.name}. Tap the Set to retry.`)
            this.end(instance)
          } else {
            instance.status = state === 'playing' ? 'Playing' : state === 'blocked' ? 'Blocked' : 'Starting'
            this.emit()
          }
        })
        player.setVolume(layer.volume)
        player.play()
        if (instance.active) {
          const state = player.status.state
          instance.status = state === 'playing' ? 'Playing' : state === 'blocked' ? 'Blocked' : 'Starting'
          this.emit()
        }
      } catch {
        this.feedback.set(setId, `Could not start ${sound.name}. Tap the Set to retry.`)
        this.end(instance)
      }
    }
    if (cached) begin(cached)
    else void this.loadMembership(setId).then(begin).catch(() => {
      if (!instance.active) return
      this.feedback.set(setId, 'Could not load Set Sounds. Tap the Set to retry.')
      this.end(instance)
    })
  }

  stopSet(layerId: string, setId: string): void {
    for (const instance of [...this.instances]) if (instance.layerId === layerId && instance.setId === setId) this.end(instance)
  }

  retryBlockedSet(layerId: string, setId: string): void {
    for (const instance of this.instances) {
      if (instance.layerId === layerId && instance.setId === setId && instance.status === 'Blocked') instance.player?.play()
    }
  }

  stopAll(): void {
    for (const instance of [...this.instances]) this.end(instance)
  }

  dispose(): void {
    this.disposed = true
    this.stopAll()
    this.listeners.clear()
  }

  private end(instance: Instance): void {
    if (!instance.active) return
    instance.active = false
    instance.unsubscribe?.()
    instance.player?.stop()
    instance.player?.dispose()
    this.instances = this.instances.filter((item) => item !== instance)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
