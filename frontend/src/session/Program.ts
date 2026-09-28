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
  pass: SoundRead[]
  nextIndex: number
  completed: number
}

function orderedPass(sounds: SoundRead[], shuffle: boolean): SoundRead[] {
  const pass = [...sounds]
  if (shuffle) {
    for (let index = pass.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1))
      ;[pass[index], pass[other]] = [pass[other], pass[index]]
    }
  }
  return pass
}

export class Program {
  private readonly loadMembership: (setId: string) => Promise<SoundRead[]>
  private readonly makePlayer: (sound: SoundRead) => AudioSourcePlayer
  private layers: LayerRead[] = []
  private sets = new Map<string, SetRead>()
  private instances: Instance[] = []
  private feedback = new Map<string, string>()
  private membership = new Map<string, SoundRead[]>()
  private membershipRevision = 0
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
    this.membershipRevision++
    this.membership.clear()
    this.layers = layers
    this.sets = new Map(sets.map((set) => [set.id, set]))
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
    const revision = ++this.membershipRevision
    this.membership.clear()
    await Promise.all(sets.map(async (set) => {
      try {
        const sounds = await this.loadMembership(set.id)
        if (!this.disposed && revision === this.membershipRevision && this.sets.has(set.id)) this.membership.set(set.id, sounds)
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
    const instance: Instance = { layerId, setId, status: 'Starting', active: true, pass: [], nextIndex: 0, completed: 0 }
    this.instances.push(instance)
    this.emit()
    // Loading may settle later; the active flag prevents it from starting stopped audio.
    const cached = this.membership.get(setId)
    const begin = (sounds: SoundRead[]) => {
      if (!instance.active || this.disposed) return
      this.startPass(instance, sounds)
    }
    if (cached) {
      this.membership.delete(setId)
      begin(cached)
    }
    else {
      // A pending prefetch must not replace this trigger's newer membership.
      this.membershipRevision++
      void this.loadMembership(setId).then(begin).catch(() => {
        if (!instance.active) return
        this.feedback.set(setId, 'Could not load Set Sounds. Tap the Set to retry.')
        this.end(instance)
      })
    }
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

  private startPass(instance: Instance, sounds: SoundRead[]): void {
    instance.pass = orderedPass(sounds, this.sets.get(instance.setId)?.shuffle ?? false)
    instance.nextIndex = 0
    instance.completed = 0
    this.advance(instance)
  }

  private advance(instance: Instance): void {
    if (!instance.active || this.disposed) return
    this.releasePlayer(instance)
    while (instance.nextIndex < instance.pass.length) {
      const sound = instance.pass[instance.nextIndex++]
      if (sound.is_errored) continue
      let player: AudioSourcePlayer
      try {
        player = this.makePlayer(sound)
        instance.player = player
        instance.unsubscribe = player.subscribe(() => {
          if (!instance.active || instance.player !== player) return
          const state = player.status.state
          if (state === 'ended' || state === 'error' || state === 'stopped') {
            if (state === 'ended') instance.completed++
            else this.feedback.set(instance.setId, `Could not play ${sound.name}. Tap the Set to retry.`)
            this.advance(instance)
          } else {
            instance.status = state === 'playing' ? 'Playing' : state === 'blocked' ? 'Blocked' : 'Starting'
            this.emit()
          }
        })
        const volume = this.layers.find((item) => item.id === instance.layerId)?.volume ?? 100
        player.setVolume(volume)
        player.play()
        if (instance.active && instance.player === player) {
          const state = player.status.state
          instance.status = state === 'playing' ? 'Playing' : state === 'blocked' ? 'Blocked' : 'Starting'
          this.emit()
        }
        return
      } catch {
        this.feedback.set(instance.setId, `Could not start ${sound.name}. Tap the Set to retry.`)
        this.releasePlayer(instance)
      }
    }
    if (instance.completed > 0 && this.sets.get(instance.setId)?.loop) {
      instance.status = 'Starting'
      this.emit()
      void this.loadMembership(instance.setId).then((sounds) => {
        if (!instance.active || this.disposed) return
        this.startPass(instance, sounds)
      }).catch(() => {
        if (!instance.active) return
        this.feedback.set(instance.setId, 'Could not load Set Sounds. Tap the Set to retry.')
        this.end(instance)
      })
    } else {
      if (instance.completed === 0 && !this.feedback.has(instance.setId)) {
        this.feedback.set(instance.setId, 'No playable Sounds. Add a Sound to this Set or clear its errors in Sound Library.')
      }
      this.end(instance)
    }
  }

  private releasePlayer(instance: Instance): void {
    instance.unsubscribe?.()
    instance.unsubscribe = undefined
    const player = instance.player
    instance.player = undefined
    player?.stop()
    player?.dispose()
  }

  private end(instance: Instance): void {
    if (!instance.active) return
    instance.active = false
    this.releasePlayer(instance)
    this.instances = this.instances.filter((item) => item !== instance)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
