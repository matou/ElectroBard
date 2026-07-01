# PRD 03 — Sets

## Overview

A Set is a collection of Sounds within a Layer, triggered as a unit. Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- Group sounds for one-tap triggering.
- Manual and automatic (tag-based) composition.

## Requirements

### Composition (exactly one mode per set)

- **Manual set** — GM picks sounds; **GM-defined order** (drag to reorder).
- **Tag-based set** — auto-populated by one or more tags; **updates dynamically** (sound gains matching tag → appears; loses it → disappears).
  - Multiple tags match with **OR** semantics (a Sound with **any** of the tags is included).
  - Order when shuffle off: **title A→Z**.
- A set is never both modes.
- A set may mix **source types freely** — uploaded files and YouTube sounds can coexist in the same set.

### Settings

- **Loop** — set repeats.
- **Shuffle** — randomized play order; **re-shuffles each loop** (fresh order per cycle). Per-set only (no layer-level shuffle).

### Playback lifecycle

- Triggering a set plays its sounds (in order, or shuffled).
- Non-looping set finishes all sounds → returns to **stopped**.
- Trigger behavior depends on the layer's playback mode (see PRD 02).
- **Membership changes mid-play apply next cycle.** If a tag-based set's membership changes (or a sound is deleted) while it plays, the current pass finishes with the sounds it started with; the new membership takes effect on the next loop / re-trigger.

## Out of scope (launch)

- Hybrid manual+tag sets.
- Transitions/crossfades between sounds (future).

## Open questions

- _(none)_
