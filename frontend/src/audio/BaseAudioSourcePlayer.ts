// Shared plumbing for the two AudioSourcePlayer backends (HowlerPlayer, YoutubePlayer):
// runs raw driver events through the pure `reduce` (playerStatus.ts), executes the
// effects it returns against driver hooks the subclass implements, and polls playback
// position while `playing` so callers see progress advance (#43 acceptance).
import type { AudioSourcePlayer } from './AudioSourcePlayer'
import { type Effect, type PlayerEvent, type PlayerStatus, type SourceKind, initialStatus, reduce } from './playerStatus'

const PROGRESS_POLL_MS = 250

export abstract class BaseAudioSourcePlayer implements AudioSourcePlayer {
  private currentStatus: PlayerStatus
  private currentProgressSeconds = 0
  private readonly listeners = new Set<() => void>()
  private progressTimer: ReturnType<typeof setInterval> | null = null

  protected constructor(kind: SourceKind) {
    this.currentStatus = initialStatus(kind)
  }

  get status(): PlayerStatus {
    return this.currentStatus
  }

  get progressSeconds(): number {
    return this.currentProgressSeconds
  }

  play(): void {
    this.dispatch({ t: 'PLAY' })
  }

  stop(): void {
    this.dispatch({ t: 'STOP' })
  }

  setVolume(volume: number): void {
    this.dispatch({ t: 'SET_VOLUME', volume })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.stopProgressTicker()
    this.listeners.clear()
    this.disposeDriver()
  }

  /** Feed a raw driver callback (Howler event / YT callback) through the reducer. */
  protected dispatch(event: PlayerEvent): void {
    const previousState = this.currentStatus.state
    const { status, effects } = reduce(this.currentStatus, event)
    this.currentStatus = status

    for (const effect of effects) {
      this.runEffect(effect)
    }

    const enteredPlaying = status.state === 'playing' && previousState !== 'playing'
    const leftPlaying = status.state !== 'playing' && previousState === 'playing'
    const restarted = status.state === 'loading' && previousState !== 'loading'
    if (enteredPlaying) {
      this.startProgressTicker()
    }
    if (leftPlaying || restarted) {
      this.stopProgressTicker()
      this.currentProgressSeconds = 0
    }

    this.notify()
  }

  private runEffect(effect: Effect): void {
    switch (effect.type) {
      case 'DRIVER_LOAD':
        this.driverLoad()
        break
      case 'DRIVER_PLAY':
        this.driverPlay()
        break
      case 'DRIVER_STOP':
        this.driverStop()
        break
      case 'DRIVER_SET_VOLUME':
        this.driverSetVolume(effect.volume)
        break
      case 'PERSIST_ERRORED':
        // M1 surfaces the error only; the is_errored write ships in M3 (#25, ADR-0007).
        break
    }
  }

  private startProgressTicker(): void {
    this.stopProgressTicker()
    this.progressTimer = setInterval(() => {
      this.currentProgressSeconds = this.readPositionSeconds()
      this.notify()
    }, PROGRESS_POLL_MS)
  }

  private stopProgressTicker(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  /** Begin loading the media (create the Howl / the YT.Player). Idempotent. */
  protected abstract driverLoad(): void
  /** Start playback once loaded (idempotent if already playing). */
  protected abstract driverPlay(): void
  /** Stop playback. */
  protected abstract driverStop(): void
  protected abstract driverSetVolume(volume: number): void
  /** Elapsed playback position in seconds, for the progress poll. */
  protected abstract readPositionSeconds(): number
  /** Release the underlying driver resource (Howl instance / YT.Player + DOM node). */
  protected abstract disposeDriver(): void
}
