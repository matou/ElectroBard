# Prototype: AudioSourcePlayer status model (logic)

**Throwaway.** Built with `/prototype` (logic branch) for wayfinder
[issue #31](https://github.com/matou/ElectroBard/issues/31) on
[map #20](https://github.com/matou/ElectroBard/issues/20). It exists to answer
one question, then be deleted once the answer is folded into the real seam.

## The question

The M1 `AudioSourcePlayer` seam wraps two very different playback backends behind
one interface (`play` / `stop` / `setVolume` / `status`) for the **preview slice
only** (play/stop, no seek):

- **file** sounds → **Howler** over `GET /api/sounds/{id}/audio` bytes — a fully
  controllable Web Audio source.
- **youtube** sounds → the **YouTube IFrame Player API** — a coarse iframe.

ADR-0001 says the source abstraction "holds for organization concerns and **leaks
at playback**." So: **does a single unified status model survive both kinds?** The
sharpest test is errors, because the two kinds classify them differently:

- A YouTube **`101`/`150`** (embed disabled) or **`100`** (gone/private) error is
  the *authoritative* verdict that the Sound is unplayable → it must write
  **`is_errored=true`** (ADR-0005).
- A file **load/decode** failure is a *transient* session error → **`is_errored`
  is never written** for file sounds (#25: "file sounds never errored").

Same `error` state, different provenance. Can one model carry that without the
caller branching on Howler-vs-IFrame internals?

## What's in here

- **`player.ts`** — the portable bit worth keeping: the pure status reducer
  (`reduce(status, event) => { status, effects }`), the unified `PlayerStatus`
  type, the two driver-event vocabularies (honest Howler + IFrame callbacks), and
  the `AudioSourcePlayer` interface sketch. No I/O, no Howler, no YouTube.
- **`tui.ts`** — a disposable terminal shell to drive the reducer by hand.

## Run it

```
node prototypes/audio-source-player/tui.ts
```

(Node 24 strips the TS types natively — no build step.)

Drive it. Fire the interface commands (`p`/`s`/`+`/`-`), switch source kind
(`f`/`y`), then inject raw driver events. The moment to watch: fire a YouTube
`101` (`!`) and see **`PERSIST_ERRORED`** appear in the effects log; fire a file
`loaderror` (`4`) and confirm it does **not** — both land in the same `error`
state, only one persists `is_errored`.

## Answer

See [`NOTES.md`](NOTES.md).
