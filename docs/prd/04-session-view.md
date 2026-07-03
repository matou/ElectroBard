# PRD 04 — Session View

## Overview

The Session View is the live performance surface where the GM triggers audio during play. Terms: see [CONTEXT.md](../../CONTEXT.md).

Design study: [Session View — Cue Console prototype](../../prototypes/session-view/) (non-functional, no audio).

## Goals

- See all layers at once and trigger any set instantly.
- Mix on the fly with per-layer volume.

## Requirements

### Layout

- All layers visible simultaneously.
- Each layer shows: quick-access **button per set**, and its own **volume slider**.

### Triggering

- Each set button shows **current status** (playing / stopped).
- **Normal (non-self-stacking) set** — one tap toggles: tap to play, tap again to stop.
- Behavior follows the layer's playback mode:
  - **Single set** — new trigger stops any playing set in that layer (hard cut).
  - **Multiset** — sets mix.
- **Self-stacking set** — tapping the tile body **always adds an instance** (stack++); it does not toggle. The tile shows a **stack count** badge (e.g. "×3") and, only while count>0, a **stop-all control** (✕) that stops every instance at once. There is no per-instance stop. Only self-stacking sets show the ✕.

### Mixing

- Per-layer volume adjustable live; persisted (see PRD 02).

### Control model

- **Single active controller** — the GM drives playback from one device; playback state (the Program) lives in that client. Running two controller views at once is unsupported (double audio). See ADR-0003.
- **No resume across reload** — reloading or crashing the session view stops all audio; the Program is not persisted or auto-resumed. The GM re-triggers what they want.

## Out of scope (launch)

- Passive listeners / sharing audio with players (future; one-way broadcast, per-listener volume).
- Real-time multi-device sync / WebSockets.
- Transition effects (future).
- Stream Deck support (future).

## Open questions

- _(none)_
