# PRD 02 — Layers

## Overview

A Layer is a named, independently-mixed channel holding sets, with its own volume and playback mode. Ships with three ordinary starter layers (music, ambience, sound effects). Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- Free-form organization of sets into layers.
- Per-layer playback semantics and volume.

## Requirements

### Layer management

- Every User is provisioned exactly once with three **starter Layers**, in this order:

  | Position | Name | Playback mode | Volume |
  |---:|---|---|---:|
  | 0 | Music | `single` | 80 |
  | 1 | Ambience | `multiset` | 80 |
  | 2 | Sound Effects | `self_stacking` | 80 |

  No starter Sets are created. The Layers are ordinary rows with no starter flag or special
  behavior: they can be renamed, reconfigured, deleted, and manually recreated. Once initial
  provisioning succeeds, missing or renamed starters are never detected or automatically
  restored.
- GM can create, rename, delete, and reorder custom layers freely.
- Layer configuration **persists** between sessions.

### Layer names

- A Layer name is a display label, not identity; APIs and relationships use the Layer UUID.
- On create and rename, leading and trailing Unicode whitespace is removed. The resulting name
  must contain 1–100 Unicode code points and no characters in Unicode general category `Cc`.
  Capitalization and internal spaces are preserved exactly; no Unicode normalization or
  case-folding is applied.
- Layer names do not have to be unique for a User. Exact duplicates and case variants are valid.
- Adding a Layer opens an unsaved settings draft. The create request is sent only after the GM
  enters a valid name and chooses **Save configuration**; placeholder text is never persisted as
  an automatic name.
- The settings sheet mirrors the server rules with an inline field error. Invalid input remains
  available to correct, and a failed rename does not change the stored Layer.

Design decision: [issue #56](https://github.com/matou/ElectroBard/issues/56).

### Starter-Layer provisioning

- The M2 schema migration provisions every existing User in the same transaction that introduces
  Layers. Future Users receive starters in the transaction that creates the User, through the same
  explicit application provisioning service used by the implicit-User path and eventual signup.
- `User.starter_layers_provisioned_at` records that provisioning completed. `NULL` means it has not
  completed; a timestamp remains set even if every original Layer is later renamed or deleted.
- Provisioning locks the User row. A call for an already-marked User succeeds as a no-op without
  inspecting or changing Layers. Creating all three Layers and setting the marker are atomic, so a
  failure leaves neither and a retry starts cleanly.
- A null marker combined with any existing Layer is an invariant violation. Provisioning stops for
  explicit repair rather than appending, replacing, or guessing. Ordinary requests never invoke
  provisioning to reconstruct missing Layers.

### Configuration workspace

The M2 workspace is an **outline plus focused settings sheet**. A compact hierarchy on the left nests Sets under their Layer; selecting one opens its editable fields on the right. Creation and reorder controls live in the outline, where the resulting Session order is visible without imitating the M3 performance surface. Settings-sheet changes are staged and committed with an explicit **Save configuration** action. A completed outline reorder is a separate action: it persists immediately and restores the previous visible order with an error if the request fails.

The application navigation keeps three responsibilities distinct:

- **Sound Library** owns Sound inventory, sources, previews, and Sound tags.
- **Layers & Sets** owns the persisted configuration described by PRDs 02 and 03.
- **Session** owns live triggering, playing state, and live mixing; it is visibly unavailable until M3. The configuration workspace contains no play buttons or live-status treatment.

The Layer settings sheet contains name, playback mode, and volume. Deleting a Layer requires a confirmation that names the Layer, states how many Sets will also be deleted, and explicitly says that Library Sounds are unaffected. If every Layer has been deleted, the outline shows a first-Layer creation action rather than an empty settings form.

Layers have one dense, manual order for both this outline and the Session view; no additional
grouping metadata is persisted. A new Layer appends to the end. Deleting a Layer preserves the
relative order of the survivors and closes the position gap. Reorder sends the complete Layer
order and succeeds or fails as one operation.

Ordering decision: [issue #59](https://github.com/matou/ElectroBard/issues/59).

Design decision: [issue #54](https://github.com/matou/ElectroBard/issues/54). The three-way throwaway study is preserved on the [`prototype/issue-54-layers-sets`](https://github.com/matou/ElectroBard/tree/prototype/issue-54-layers-sets/prototypes/layers-sets) branch; its Variant C was selected.

### Playback mode (per layer)

- **Single set** — triggering a new set immediately stops the current one (hard cut, no transition at launch).
- **Multiset** — multiple sets play and mix.
  - **Self-stacking** (multiset refinement) — the same set can be triggered again to layer over itself.
- A saved mode change affects the active Program immediately. Changing to `single` keeps only
  the oldest active Set instance in that Layer. Changing from `self_stacking` to `multiset`
  keeps only the oldest active instance of each Set. Stopped instances never restart when
  the mode later becomes more permissive. See PRD 04 for Program coordination.

### Volume

- Each layer has a volume the GM adjusts live.
- Volume is **persisted** as part of layer config (survives reload).
- The Session slider changes the local mix immediately for all active instances in that
  Layer. Saves are debounced and ordered per Layer so the latest value wins. A failed save
  leaves the local mix in place, shows that it is unsaved, and offers Retry. Reload uses
  the last successfully saved value. A successful volume edit in Layers & Sets updates
  the live mix immediately, including while Session is hidden. In the same tab, its
  settings sheet reflects the Program's current local volume, including an unsaved
  change, so saving another Layer field does not overwrite that volume with a
  stale server value.
- Conceptually per-listener (see ADR-0003); at launch there is one listener (the GM), so it is simply the GM's mix.
- New layers default to **80%** volume.

## Out of scope (launch)

- Mute / solo per layer (future).
- Transition effects between sets (future; launch is hard cut).
- Per-listener mixes (future; requires the listener feature).

## Open questions

- _(none)_
