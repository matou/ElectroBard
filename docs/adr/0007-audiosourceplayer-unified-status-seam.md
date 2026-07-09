# AudioSourcePlayer: one unified status model, error-provenance carried in the seam

The M1 `AudioSourcePlayer` seam wraps two playback backends behind one interface
(`play` / `stop` / `setVolume` / `status`) for the **preview slice** (play/stop,
no seek): **file** sounds via **Howler** over `GET /api/sounds/{id}/audio`, and
**youtube** sounds via the **YouTube IFrame Player API**. ADR-0001 says the source
abstraction "leaks at playback." This decision fixes *how* the seam absorbs that
leak so callers (the Library UI, #21) never branch on Howler-vs-IFrame internals.

Both kinds expose **one `PlayerStatus`**: `{ kind, state, volume, errorClass?,
errorDetail? }` over a single `PlaybackState` vocabulary — `idle → loading →
playing → stopped / ended`, plus `error`. Each backend's native callbacks
(Howler `load`/`play`/`end`/`loaderror`/`playerror`; IFrame state 3/1/2/0 +
`onError`) fold into that one vocabulary.

The leak lands entirely on the `error` state, discriminated by **`errorClass:
"transient" | "persistent"`**. Only a `persistent` error persists `is_errored`
(ADR-0005). A single reducer owns this rule:

| source | signal | class | persists `is_errored`? |
|---|---|---|---|
| youtube | `101` / `150` (embed disabled), `100` (removed/private), `2` (invalid id) | persistent | **yes** |
| youtube | `5` (HTML5 player error) | transient | no |
| file | `loaderror` / `playerror` | transient | **no** — file sounds are never errored (#25) |

## Consequences

- **The "who writes `is_errored`" rule lives in one place** — the status reducer —
  not scattered across the two player impls. Callers react to `PlayerStatus` only.
- **File failures never brand a Sound.** A flaky load is a session-level `error`
  (transient); retry via `play()` is allowed. Only YouTube produces `is_errored`,
  matching ADR-0005 (client `onError` is the authoritative verdict) and #25
  (M1 owns the `is_errored` *read* contract; the *writer* ships in M3).
- **Testable behind a fake.** The seam is a pure `(status, event) => { status,
  effects }` reducer with an effect list, so Howler and the IFrame API mock at the
  interface (dev-setup.md) and the persist decision is unit-testable without audio.
- **Classifier edges deferred, not blocking.** `2`→persistent and `5`→transient
  are the current calls; the full `onError`-code→GM-text vocabulary is M3 (#25).
  The `PERSIST_ERRORED` payload carries a flag + text `detail` for M1; storing the
  raw code is a later, non-breaking add if it proves needed.

Validated with a throwaway `/prototype` (logic) under wayfinder #31 / map #20;
the prototype was deleted once the shape was agreed (PR #33). Relates to
[ADR-0001](0001-client-side-audio.md) and [ADR-0005](0005-youtube-keyless-oembed-ingestion.md).
