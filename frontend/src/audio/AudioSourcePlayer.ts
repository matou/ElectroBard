// The playback seam (ADR-0001, ADR-0007): one interface the UI drives, wrapping both
// Howler (file sounds, HowlerPlayer.ts) and the YouTube IFrame API (youtube sounds,
// YoutubePlayer.ts) so every source plays uniformly. This is the boundary component
// tests mock instead of touching real audio (dev-setup.md) — see createAudioSourcePlayer.
import type { PlayerStatus } from './playerStatus'

export interface AudioSourcePlayer {
  play(): void
  stop(): void
  /** Volume as the model's integer 0-100 percent (risks.md Q1), not a 0..1 fraction. */
  setVolume(volume: number): void
  readonly status: PlayerStatus
  /** Seconds of playback elapsed. 0 until the first progress tick after `play()`. */
  readonly progressSeconds: number
  /** Fires on every status or progress change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Releases the underlying driver (Howl instance / YT.Player). Stops playback first. */
  dispose(): void
}
