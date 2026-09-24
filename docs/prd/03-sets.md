# PRD 03 — Sets

## Overview

A Set is a collection of Sounds within a Layer, triggered as a unit. Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- Group sounds for one-tap triggering.
- Automatic (tag-based) composition.

## Requirements

### Composition (tag-based)

- **Tag-based set** — auto-populated by zero or more tags; **updates dynamically** (sound gains matching tag → appears; loses it → disappears).
  - Multiple tags match with **OR** semantics (a Sound with **any** of the tags is included).
  - Each matching Sound appears exactly once by identity, even when it matches multiple selected
    Tags. Sounds with the same name remain distinct.
  - Zero selected tags is a valid configuration and resolves to zero Sounds. A GM may create a
    tagless Set or clear its final tag; deleting a Tag may produce the same state. A tagless Set
    remains fully editable and requires no repair.
  - Canonical order is server-defined **name A→Z**: ascending by the stored name's Unicode
    default case-folded value without normalization, then by Sound UUID. Clients preserve this
    order rather than applying their own locale collation.
  - Errored Sounds remain members and appear in canonical order with their error state. Skipping
    them is an M3 playback concern, not membership filtering.
- A set may mix **source types freely** — uploaded files and YouTube sounds can coexist in the same set.

### Settings

- **Loop** — set repeats.
- **Shuffle** — randomized play order; **re-shuffles each loop** (fresh order per cycle). Per-set only (no layer-level shuffle).

### Set names

- A Set name is a display label, not identity; APIs and relationships use the Set UUID.
- On create and rename, leading and trailing Unicode whitespace is removed. The resulting name
  must contain 1–100 Unicode code points and no characters in Unicode general category `Cc`.
  Capitalization and internal spaces are preserved exactly; no Unicode normalization or
  case-folding is applied.
- Set names do not have to be unique within a Layer. Exact duplicates and case variants are valid,
  and the same names may also appear in different Layers.
- Adding a Set opens an unsaved settings draft. The create request is sent only after the GM
  enters a valid name and chooses **Save configuration**; placeholder text is never persisted as
  an automatic name.
- The settings sheet mirrors the server rules with an inline field error. Invalid input remains
  available to correct, and a failed rename does not change the stored Set.

Design decision: [issue #56](https://github.com/matou/ElectroBard/issues/56).

### Configuration workspace

Sets appear beneath their Layer in the Layers & Sets outline and can be created, selected, deleted, and reordered within that Layer. Selecting a Set opens a focused settings sheet containing its name, tag selection, loop, and shuffle. Edits use the workspace's explicit **Save configuration** action (PRD 02); a completed outline reorder persists immediately as a separate action.

A Layer's Sets have one dense, manual order for both this outline and the Session view. A new Set
appends to the end. Deleting a Set preserves the relative order of the survivors and closes the
position gap. Reorder sends the Layer's complete Set order and succeeds or fails as one operation.
It cannot move a Set to another Layer; no Set reparenting operation ships at launch.

Ordering decision: [issue #59](https://github.com/matou/ElectroBard/issues/59).

The sheet includes a read-only **Resolved membership** preview: matching Sound count plus the
server-ordered A→Z list of Sound names and source types. It labels multi-tag matching as **any
selected tag (OR)** so the preview cannot be mistaken for manual membership. The outline labels a
tagless Set **No Tags selected**, without warning or error styling, and the sheet explains that it
contains no Sounds until the GM selects Tags. A Set with selected Tags but no matches gets distinct
empty-state copy directing the GM to tag Sounds in the Sound Library or change the selection. Both
states remain valid, and Save is available.

Deleting a Tag needs no Set-specific impact message. Any Set that consequently loses its final
Tag surfaces through the same neutral tagless state when the GM next views this workspace.

Deleting a Set requires confirmation and explicitly says that its matching Library Sounds are unaffected. The sheet offers no triggering, playback state, or live controls; those belong exclusively to the M3 Session view.

### Playback lifecycle

- Each start trigger creates one Set instance (or adds one in self-stacking mode; see PRD 04).
  It fetches current resolved membership and builds a **pass**: each Sound appears once
  in server name order, or in one random permutation when Shuffle is enabled. Uploaded
  files and YouTube Sounds occupy ordinary slots in the same sequential pass; a Sound's
  natural end advances to the next slot without overlap within that instance.
- A pass snapshots membership and Shuffle when it begins. A membership edit, Tag edit,
  Sound addition, Sound deletion, or Shuffle edit does not reorder or replace slots in
  progress. At the next pass or re-trigger, fetch membership again and apply the current
  Shuffle setting. Every shuffled pass gets a fresh permutation; the same order may
  recur by chance. There is no requirement to force a different order.
- Eligibility is checked when each slot is reached. An already-errored Sound, or one
  locally known to have a persistent YouTube error, is skipped even if it entered the
  pass snapshot before the error appeared. A Sound deleted during a pass retains its
  queued slot; attempt it from the snapshot when reached. If its source is then
  unavailable, treat that attempt as a transient failure and advance. A Sound already
  playing may finish if its source remains available. Deleted Sounds disappear from the
  next membership fetch.
- After the final slot, the **current Loop value** determines completion. If Loop is
  off, the instance stops. If Loop is on and at least one Sound completed in the pass,
  fetch current membership and build the next pass. Turning Loop on during a
  non-looping pass can therefore extend it; turning Loop off lets the current pass
  finish. Loop and Shuffle edits never restart or cut off the current Sound.
- A trigger with no playable Sounds stays stopped. If a pass has no completed Sounds
  because every candidate was skipped or failed, the instance stops even when Loop is
  on; it never waits or spins on an empty pass. A stopped Set does not restart when
  membership or error status changes; the GM triggers it again. See PRD 04 for the
  stopped-tile explanation and failure notices.
- A source failure at any point advances immediately to the next candidate. Transient
  failures remain eligible on a later pass; persistent YouTube failures remain skipped
  until Recheck clears their error (PRD 01). Deleting a Set immediately stops all its
  active instances. Trigger and cross-Set stop behavior follows the Layer's playback
  mode (PRD 02 and PRD 04).

## Out of scope (launch)

- Manual sets (GM hand-picks sounds and orders them). Deferred; launch is tag-based only.
- Hybrid manual+tag sets.
- Transitions/crossfades between sounds (future).

## Open questions

- _(none)_
