// The playback seam (tech-stack, ADR-0001): one interface the UI drives, wrapping
// both Howler (file sounds) and the YouTube IFrame API (YouTube sounds) so every
// source plays uniformly. Only the seam exists at M0 — implementations and the test
// fake arrive when the session view consumes them (M3). This is the boundary the
// frontend mocks in component tests (dev-setup.md).

export type PlayerStatus = 'idle' | 'playing' | 'stopped'

export interface AudioSourcePlayer {
  play(): void
  stop(): void
  /** Volume as 0–100 percent, matching the model's integer volume. */
  setVolume(volume: number): void
  readonly status: PlayerStatus
}
