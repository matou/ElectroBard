// The pure status reducer behind AudioSourcePlayer (ADR-0007). No I/O, no Howler, no
// YouTube API here — only the translation of raw driver events into ONE unified status
// model, and the decision of when a playback failure must persist `is_errored`
// (ADR-0005). Validated as a throwaway /prototype (#31, deleted in PR #33); this is the
// real, tested version the two backends (HowlerPlayer, YoutubePlayer) drive.

export type SourceKind = 'file' | 'youtube'

// "preview slice" only: play/stop, no seek (prototype #21).
export type PlaybackState =
  | 'idle' // constructed, nothing requested yet
  | 'loading' // fetching/buffering the media
  | 'playing' // audible
  | 'stopped' // was playing, user stopped
  | 'ended' // reached natural end (non-looping preview)
  | 'error' // playback failed — see errorClass for what it means

// When state === 'error', whether the failure sticks to the Sound.
//   transient  → this session only; retrying might work; NEVER is_errored.
//   persistent → the Sound is structurally unplayable; write is_errored=true (M3, #25).
export type ErrorClass = 'transient' | 'persistent'

// The observable status the AudioSourcePlayer interface exposes. One shape, both kinds.
// `volume` is the model's integer 0-100 percent (risks.md Q1), not a 0..1 fraction.
export interface PlayerStatus {
  kind: SourceKind
  state: PlaybackState
  volume: number
  errorClass?: ErrorClass
  errorDetail?: string
}

// Effects the reducer asks the outer driver (HowlerPlayer / YoutubePlayer) to perform.
// The reducer stays pure; the impl wires these to Howler / the IFrame API and to the
// PATCH that persists is_errored (M3 — not built here; the seam only leaves room for it).
export type Effect =
  | { type: 'DRIVER_LOAD' }
  | { type: 'DRIVER_PLAY' }
  | { type: 'DRIVER_STOP' }
  | { type: 'DRIVER_SET_VOLUME'; volume: number }
  | { type: 'PERSIST_ERRORED'; detail: string }

// Commands come from the AudioSourcePlayer interface (play/stop/setVolume). Driver
// events are each backend's raw callback vocabulary, kept honest rather than pre-mapped.
export type Command = { t: 'PLAY' } | { t: 'STOP' } | { t: 'SET_VOLUME'; volume: number }

// Howler callbacks (file sounds). https://github.com/goldfire/howler.js
export type FileEvent =
  | { t: 'FILE_LOAD' } // 'load' — decoded & ready
  | { t: 'FILE_PLAY' } // 'play'
  | { t: 'FILE_END' } // 'end' (non-looping)
  | { t: 'FILE_STOP' } // 'stop'
  | { t: 'FILE_LOADERROR' } // 'loaderror' — network/404/undecodable container
  | { t: 'FILE_PLAYERROR' } // 'playerror' — decode/output failure mid-play

// YouTube IFrame Player API callbacks (youtube sounds).
// onStateChange: -1 unstarted, 3 buffering, 1 playing, 2 paused, 0 ended.
// onError: 2 invalid id, 5 html5 error, 100 removed/private, 101/150 embedding disallowed.
export type YouTubeErrorCode = 2 | 5 | 100 | 101 | 150

export type YouTubeEvent =
  | { t: 'YT_BUFFERING' } // state 3
  | { t: 'YT_PLAYING' } // state 1
  | { t: 'YT_PAUSED' } // state 2
  | { t: 'YT_ENDED' } // state 0
  | { t: 'YT_ERROR'; code: YouTubeErrorCode }

export type PlayerEvent = Command | FileEvent | YouTubeEvent

export interface Transition {
  status: PlayerStatus
  effects: Effect[]
}

// Maps a raw YouTube onError code to (errorClass, detail). Only the transient/persistent
// split is needed for M1; the full onError-code→GM-text vocabulary is M3 (#25).
function classifyYouTubeError(code: YouTubeErrorCode): { errorClass: ErrorClass; detail: string } {
  switch (code) {
    case 101:
    case 150:
      return { errorClass: 'persistent', detail: 'Embedding disabled by owner' }
    case 100:
      return { errorClass: 'persistent', detail: 'Video removed or private' }
    case 2:
      return { errorClass: 'persistent', detail: 'Invalid video id' }
    case 5:
      return { errorClass: 'transient', detail: 'Player error (HTML5)' }
  }
}

export function reduce(status: PlayerStatus, event: PlayerEvent): Transition {
  switch (event.t) {
    // ── Commands (interface-level; kind-agnostic) ──
    case 'PLAY':
      // From any non-playing state, (re)start: load then play. Already playing is a
      // no-op. From error, allow a retry — the impl decides whether the driver can.
      if (status.state === 'playing') {
        return { status, effects: [] }
      }
      return {
        status: { ...status, state: 'loading', errorClass: undefined, errorDetail: undefined },
        effects: [{ type: 'DRIVER_LOAD' }, { type: 'DRIVER_PLAY' }],
      }

    case 'STOP':
      if (status.state === 'idle' || status.state === 'stopped') {
        return { status, effects: [] }
      }
      return { status: { ...status, state: 'stopped' }, effects: [{ type: 'DRIVER_STOP' }] }

    case 'SET_VOLUME': {
      const volume = Math.max(0, Math.min(100, event.volume))
      return { status: { ...status, volume }, effects: [{ type: 'DRIVER_SET_VOLUME', volume }] }
    }

    // ── File driver events (Howler) ──
    case 'FILE_LOAD':
      // Decoded & ready; if loading toward play, the driver follows up with FILE_PLAY.
      return { status, effects: [] }

    case 'FILE_PLAY':
      return { status: { ...status, state: 'playing' }, effects: [] }

    case 'FILE_END':
      return { status: { ...status, state: 'ended' }, effects: [] }

    case 'FILE_STOP':
      return { status: { ...status, state: 'stopped' }, effects: [] }

    case 'FILE_LOADERROR':
    case 'FILE_PLAYERROR':
      // File failures are ALWAYS transient — #25: file sounds never errored. Same
      // unified `error` state as a YouTube error, but no PERSIST_ERRORED effect.
      return {
        status: {
          ...status,
          state: 'error',
          errorClass: 'transient',
          errorDetail: event.t === 'FILE_LOADERROR' ? 'Could not load file' : 'Could not play file',
        },
        effects: [],
      }

    // ── YouTube driver events (IFrame API) ──
    case 'YT_BUFFERING':
      return { status: { ...status, state: 'loading' }, effects: [] }

    case 'YT_PLAYING':
      return { status: { ...status, state: 'playing' }, effects: [] }

    case 'YT_PAUSED':
      // Preview has no pause affordance (no-seek slice); treat a pause as stopped.
      return { status: { ...status, state: 'stopped' }, effects: [] }

    case 'YT_ENDED':
      return { status: { ...status, state: 'ended' }, effects: [] }

    case 'YT_ERROR': {
      const { errorClass, detail } = classifyYouTubeError(event.code)
      return {
        status: { ...status, state: 'error', errorClass, errorDetail: detail },
        // THE LEAK (ADR-0007): only a persistent YouTube error writes is_errored.
        effects: errorClass === 'persistent' ? [{ type: 'PERSIST_ERRORED', detail }] : [],
      }
    }
  }
}

export function initialStatus(kind: SourceKind): PlayerStatus {
  return { kind, state: 'idle', volume: 100 }
}
