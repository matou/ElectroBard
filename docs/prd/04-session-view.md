# PRD 04 — Session View

## Overview

The Session View is the live performance surface where the GM triggers audio during play. Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- See all layers at once and trigger any set instantly.
- Mix on the fly with per-layer volume.

## Requirements

### Layout

- All layers visible simultaneously.
- Each layer shows: quick-access **button per set**, and its own **volume slider**.

### Triggering

- Click a set button → plays; click again → stops.
- Each set button shows **current status** (playing / stopped).
- Behavior follows the layer's playback mode:
  - **Single set** — new trigger stops any playing set in that layer (hard cut).
  - **Multiset** — sets mix; with **self-stacking**, the same set can layer over itself.

### Mixing

- Per-layer volume adjustable live; persisted (see PRD 02).

### Control model

- **Single active controller** — the GM drives playback from one device; playback state (the Program) lives in that client. Running two controller views at once is unsupported (double audio). See ADR-0003.

## Out of scope (launch)

- Passive listeners / sharing audio with players (future; one-way broadcast, per-listener volume).
- Real-time multi-device sync / WebSockets.
- Transition effects (future).
- Stream Deck support (future).

## Open questions

- Visual treatment of a self-stacked set's count — TBD.
