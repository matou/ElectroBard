// ─────────────────────────────────────────────────────────────────────────
// AudioSourcePlayer — PROTOTYPE logic module (wayfinder #31, map #20)
//
// THROWAWAY. This is the portable bit worth keeping: the pure status reducer
// behind the M1 `AudioSourcePlayer` seam. The TUI (tui.ts) is a disposable
// shell that drives it. No I/O, no Howler, no YouTube API in here — only the
// translation of raw driver events into ONE unified status model, and the
// decision of when playback must persist `is_errored` (ADR-0005).
//
// The question this answers: does a single status model hold across a fully-
// controllable Web Audio file source (Howler) AND a coarse YouTube IFrame,
// given that ADR-0001 says the source abstraction "leaks at playback"? The
// sharpest leak is errors: a YouTube embed-disallowed error is PERSISTENT
// (writes is_errored), whereas a file load/decode failure is TRANSIENT
// (#25: "file sounds never errored"). Same `error` state, different provenance.
// ─────────────────────────────────────────────────────────────────────────

export type SourceKind = "file" | "youtube";

// The unified playback state — identical vocabulary for both source kinds.
// "preview slice" only: play/stop, no seek (prototype #21).
export type PlaybackState =
  | "idle" // constructed, nothing requested yet
  | "loading" // fetching/buffering the media
  | "playing" // audible
  | "stopped" // was playing, user stopped (or paused, for YT)
  | "ended" // reached natural end (non-looping preview)
  | "error"; // playback failed — see errorClass for what it means

// When state === "error", this says whether the failure sticks to the Sound.
//   transient  → this session only; retrying might work; NEVER is_errored.
//   persistent → the Sound is structurally unplayable; write is_errored=true.
export type ErrorClass = "transient" | "persistent";

// The observable status the AudioSourcePlayer interface exposes. One shape,
// both kinds. `kind` is retained so callers can special-case the leak without
// branching on which concrete player they hold.
export interface PlayerStatus {
  kind: SourceKind;
  state: PlaybackState;
  volume: number; // 0..1
  errorClass?: ErrorClass; // present iff state === "error"
  errorDetail?: string; // human string; the code→text vocabulary itself is M3
}

// Effects the reducer asks the OUTER shell (the real player impl) to perform.
// The reducer stays pure; the impl wires these to Howler / the IFrame API and
// to the PATCH that persists is_errored.
export type Effect =
  | { type: "DRIVER_LOAD" } // begin loading the media
  | { type: "DRIVER_PLAY" } // tell the driver to start
  | { type: "DRIVER_STOP" } // tell the driver to stop
  | { type: "DRIVER_SET_VOLUME"; volume: number }
  | { type: "PERSIST_ERRORED"; detail: string }; // <-- the is_errored write (ADR-0005)

// ── Events ─────────────────────────────────────────────────────────────────
// Two vocabularies feed one reducer. COMMANDS come from the AudioSourcePlayer
// interface (play/stop/setVolume). DRIVER events are the raw callbacks each
// backend emits — deliberately kept as the real Howler / IFrame vocabulary so
// the mapping is honest.

export type Command =
  | { t: "PLAY" }
  | { t: "STOP" }
  | { t: "SET_VOLUME"; v: number };

// Howler callbacks (file sources). https://github.com/goldfire/howler.js
export type FileEvent =
  | { t: "FILE_LOAD" } // 'load' — decoded & ready
  | { t: "FILE_PLAY" } // 'play'
  | { t: "FILE_END" } // 'end' (non-looping)
  | { t: "FILE_STOP" } // 'stop'
  | { t: "FILE_LOADERROR" } // 'loaderror' — network/404/undecodable container
  | { t: "FILE_PLAYERROR" }; // 'playerror' — decode/output failure mid-play

// YouTube IFrame Player API callbacks (youtube sources).
// onStateChange: -1 unstarted, 3 buffering, 1 playing, 2 paused, 0 ended.
// onError: 2 invalid id, 5 html5 error, 100 removed/private,
//          101/150 embedding disallowed by owner.
export type YouTubeEvent =
  | { t: "YT_BUFFERING" } // state 3
  | { t: "YT_PLAYING" } // state 1
  | { t: "YT_PAUSED" } // state 2
  | { t: "YT_ENDED" } // state 0
  | { t: "YT_ERROR"; code: 2 | 5 | 100 | 101 | 150 };

export type PlayerEvent = Command | FileEvent | YouTubeEvent;

export interface Transition {
  status: PlayerStatus;
  effects: Effect[];
}

// ── The classifier — the crux of the leak ────────────────────────────────────
// Maps a raw YouTube onError code to (errorClass, detail). The M1 seam only
// needs the transient/persistent split; the full onError-code→GM-text vocabulary
// ships in M3 (#25), so details here are placeholders.
function classifyYouTubeError(code: 2 | 5 | 100 | 101 | 150): {
  errorClass: ErrorClass;
  detail: string;
} {
  switch (code) {
    case 101:
    case 150:
      // Owner disallows embedding — authoritative, will not self-heal.
      return { errorClass: "persistent", detail: "Embedding disabled by owner" };
    case 100:
      // Video removed or private — gone for good (until re-added).
      return { errorClass: "persistent", detail: "Video removed or private" };
    case 2:
      // Malformed/invalid video id — a bad Sound row, won't fix itself.
      return { errorClass: "persistent", detail: "Invalid video id" };
    case 5:
      // HTML5 player error — often environmental/transient; retry may help.
      return { errorClass: "transient", detail: "Player error (HTML5)" };
  }
}

// ── The reducer — pure (status, event) => { status, effects } ────────────────
export function reduce(status: PlayerStatus, event: PlayerEvent): Transition {
  const kind = status.kind;

  switch (event.t) {
    // ── Commands (interface-level; kind-agnostic) ──
    case "PLAY":
      // From any non-playing state, (re)start: load then play. If already
      // playing, no-op. From error, allow a retry (transient) — the impl
      // decides whether the driver can actually retry.
      if (status.state === "playing") return { status, effects: [] };
      return {
        status: { ...status, state: "loading", errorClass: undefined, errorDetail: undefined },
        effects: [{ type: "DRIVER_LOAD" }, { type: "DRIVER_PLAY" }],
      };

    case "STOP":
      return {
        status: { ...status, state: "stopped" },
        effects: [{ type: "DRIVER_STOP" }],
      };

    case "SET_VOLUME": {
      const volume = Math.max(0, Math.min(1, event.v));
      return {
        status: { ...status, volume },
        effects: [{ type: "DRIVER_SET_VOLUME", volume }],
      };
    }

    // ── File driver events (Howler) ──
    case "FILE_LOAD":
      // decoded & ready; if we were loading toward play, driver will emit PLAY.
      return { status: { ...status, state: status.state === "loading" ? "loading" : "stopped" }, effects: [] };

    case "FILE_PLAY":
      return { status: { ...status, state: "playing" }, effects: [] };

    case "FILE_END":
      return { status: { ...status, state: "ended" }, effects: [] };

    case "FILE_STOP":
      return { status: { ...status, state: "stopped" }, effects: [] };

    case "FILE_LOADERROR":
    case "FILE_PLAYERROR":
      // File failures are ALWAYS transient — #25: file sounds never errored.
      // Unified `error` state, but NO PERSIST_ERRORED effect.
      return {
        status: {
          ...status,
          state: "error",
          errorClass: "transient",
          errorDetail: event.t === "FILE_LOADERROR" ? "Could not load file" : "Could not play file",
        },
        effects: [],
      };

    // ── YouTube driver events (IFrame API) ──
    case "YT_BUFFERING":
      return { status: { ...status, state: "loading" }, effects: [] };

    case "YT_PLAYING":
      return { status: { ...status, state: "playing" }, effects: [] };

    case "YT_PAUSED":
      // Preview has no pause affordance; treat a pause as stopped.
      return { status: { ...status, state: "stopped" }, effects: [] };

    case "YT_ENDED":
      return { status: { ...status, state: "ended" }, effects: [] };

    case "YT_ERROR": {
      const { errorClass, detail } = classifyYouTubeError(event.code);
      return {
        status: { ...status, state: "error", errorClass, errorDetail: detail },
        // THE LEAK: only a persistent YouTube error writes is_errored (ADR-0005).
        effects: errorClass === "persistent" ? [{ type: "PERSIST_ERRORED", detail }] : [],
      };
    }
  }
}

export function initialStatus(kind: SourceKind): PlayerStatus {
  return { kind, state: "idle", volume: 1 };
}

// ── The seam itself (interface sketch — impls are NOT prototyped here) ────────
// The two concrete players wrap Howler / the IFrame API, translate their native
// callbacks into PlayerEvents, run them through `reduce`, hold the resulting
// PlayerStatus, and execute the returned Effects. This interface is what the
// Library UI (#21) depends on — it never sees Howler or the IFrame API.
export interface AudioSourcePlayer {
  play(): void;
  stop(): void;
  setVolume(v: number): void; // 0..1
  readonly status: PlayerStatus;
  subscribe(listener: (status: PlayerStatus) => void): () => void;
}
