# PRD 04 — Session View

## Overview

The Session View is the live performance surface where the GM triggers audio during play. Terms: see [CONTEXT.md](../../CONTEXT.md).

Design direction: use the full-width Layer racks and Set tiles from the
[Session View — Cue Console prototype](../../prototypes/session-view/) as the
layout reference (non-functional, no audio). The prototype's additional controls
are not launch requirements; the rules below govern the M3 implementation.

## Goals

- See all layers at once and trigger any set instantly.
- Mix on the fly with per-layer volume.

## Requirements

### Layout

- All layers visible simultaneously.
- Show full-width Layer racks in the saved Layer order. Each rack contains its
  Sets in saved order, with quick-access **button per Set** and a labeled
  **per-Layer volume slider**.
- On phones, keep every Layer rack expanded in one vertical scroll. Set tiles
  wrap into as many columns as fit at a usable touch size; no Layer tabs,
  horizontal Set scrolling, or collapsed racks. Keep a compact global **Stop
  all** control available while scrolling.
- Set tiles keep a stable size as playback changes. The primary information is
  the Set name and its playing/stopped state, plus a stack count in
  self-stacking mode. Tags, membership counts, loop/shuffle settings, and the
  current Sound are not part of the launch tile. The Layers & Sets workspace
  owns configuration detail and playback-mode editing.

### Triggering

- Each set button shows **current status** (playing / stopped).
- **Normal (non-self-stacking) set** — one tap toggles: tap to play, tap again to stop.
- Behavior follows the layer's playback mode:
  - **Single set** — new trigger stops any playing set in that layer (hard cut).
  - **Multiset** — sets mix.
- **Self-stacking set** — tapping the tile body **always adds an instance**
  (stack++); it does not toggle. The tile shows a **stack count** badge (e.g.
  "×3") and, only while count>0, a **Stop this Set** control that stops every
  instance of that Set at once. There is no per-instance stop.
- The self-stacking stop control is a separate button beside the trigger, not a
  control nested inside it. It is labeled **Stop this Set** visually and
  **Stop all instances of [Set name] in [Layer name]** for assistive technology.
  Its action
  never triggers another instance.
- A visually distinct global **Stop all** button immediately stops every
  playing Set and instance, without a confirmation dialog. It remains visible
  on phones while scrolling. It does not reset Layer volumes.
- Playing state must be clear without relying on color or animation alone.
  Trigger and stop buttons have at least 44 × 44 CSS pixel touch targets,
  visible keyboard focus, and accessible names that state the action, Set, and
  Layer (names may repeat).
  Volume sliders have Layer-specific labels and expose their current numeric
  values. Live updates must preserve keyboard focus and announce relevant
  playback-state changes without repeated, noisy announcements.

### Playback failures

- Before and during playback, skip any Sound already marked errored or locally known to have a
  persistent YouTube error, including one whose server write is still pending. This local skip
  applies across all active and newly triggered Sets in this browser. Skipping does not change
  resolved Set membership or its canonical order.
- When a Sound fails, advance that Set instance to its next candidate immediately without
  waiting for an error write. A transient file or YouTube failure is eligible again on a later
  loop if other Sounds keep the Set active. A newly cleared errored Sound becomes eligible on the
  next loop, matching the next-cycle membership rule; it never restarts a stopped Set.
- If a Set has no playable Sounds at trigger time, keep it stopped. If every candidate fails or
  is skipped during a pass, stop that instance, including a looping or self-stacked instance;
  never spin through an empty loop. Keep a fixed-size **No playable Sounds** status on the
  stopped Set tile until dismissed or the next trigger, with the full explanation in the Session
  notice. The tile must keep its normal size.
- Show a nonblocking Session notice naming each skipped or failed Sound and its cause, once per
  Sound per Set activation across loops and self-stacked instances (for a stack, from its first
  active instance until its last one stops). Update that notice if its cause changes instead of
  duplicating it. Label transient failures as temporary. Per-Sound
  notices may clear when the Set stops; the stopped-tile explanation stays. A failed persistence
  write must be visibly identified as unsaved, so the GM does not mistake a local skip for a
  durable error. The Library retains the full cause and Recheck action (PRD 01).

### Mixing

- Per-layer volume adjustable live; persisted (see PRD 02).
- No master-volume slider ships in the Session view at launch.

### Session chrome

- Keep the app's normal navigation and the global **Stop all** action. The
  prototype's Program readout, session clock, list/grid switch, and inline
  playback-mode controls do not ship at launch.

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
