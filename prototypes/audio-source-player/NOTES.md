# AudioSourcePlayer status model — answer

Question: does one unified status model hold across Howler (file) and the YouTube
IFrame (youtube) for the M1 preview slice, given ADR-0001's "leaks at playback"?
Full framing in [README.md](README.md).

## Proposed answer (pending GM confirmation)

**Yes — one status model holds, and the playback leak is absorbed by exactly two
constructs**, not by callers branching on the concrete player:

1. **A shared `PlayerStatus`** — `{ kind, state, volume, errorClass?, errorDetail? }`
   with one `PlaybackState` vocabulary (`idle → loading → playing → stopped/ended`,
   plus `error`). Both backends' native callbacks fold into it.

2. **`errorClass: "transient" | "persistent"`** on the single `error` state. This
   is where the leak lands: the *state* is unified, the *provenance* differs.
   Only `persistent` emits the **`PERSIST_ERRORED`** effect (the `is_errored`
   write, ADR-0005). File load/play errors are always `transient` → never persist
   (#25). This keeps the "who writes is_errored" rule in **one** place — the
   reducer — instead of scattered across the two impls.

Callers never see Howler or the IFrame API; the reducer + effect list is the seam.

### The classifier (the one real decision surface)

`onError` → class (M1 needs only the split; the code→GM-text vocabulary is M3, #25):

| source | signal | class | is_errored? |
|---|---|---|---|
| youtube | 101 / 150 (embed disabled) | persistent | **yes** |
| youtube | 100 (removed/private) | persistent | **yes** |
| youtube | 2 (invalid id) | persistent | **yes** |
| youtube | 5 (HTML5 player error) | transient | no |
| file | loaderror / playerror | transient | no |

### Open for the GM to confirm

- **YT `2` (invalid id) → persistent?** Modelled persistent (a bad id won't
  self-heal). If the GM would rather let a bad row be re-checked, flip to transient.
- **YT `5` (HTML5) → transient?** Modelled transient (often environmental). Confirm.
- **`PERSIST_ERRORED` payload** — currently `{ detail }`. Does the M1 write also
  need the `onError` code stored, or is the flag + a text detail enough for now?
  (The onError-code→text vocabulary is explicitly M3, so likely flag+detail.)

<!-- Fill in the GM's verdict here, then fold the reducer/PlayerStatus into the
     real frontend module and delete this prototype dir. -->
