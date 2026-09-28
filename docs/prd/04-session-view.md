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

- Each Set button shows its current **Starting / Playing / Blocked / Stopped** status.
- **Normal (non-self-stacking) set** — one tap toggles: tap to play, tap again to stop.
- A Set whose first source is still loading counts as active. A repeat tap stops it in
  `single` or `multiset` mode; in `self_stacking` mode it adds another instance.
- Behavior follows the layer's playback mode:
  - **Single set** — a trigger immediately stops every active instance in that Layer,
    before fetching the new Set's membership or loading its first source (hard cut).
    If the new Set cannot play, the Layer stays silent and shows failure feedback.
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
  on phones while scrolling and remains available during in-app navigation away
  from Session. It does not reset Layer volumes.
- A tile shows **Starting** while any active instance is awaiting a source and
  none is playing, **Playing** while any instance is playing, **Blocked** when
  none is playing or starting but at least one waits for a user gesture, and
  **Stopped** when none remain.
  Starting and Blocked are distinct, non-color-only states with a working Stop
  action. The stack badge counts active instances, including starting and blocked
  ones. When some instances play while others are blocked, keep the tile Playing
  and show a separate blocked count and Retry action.
- Playing state must be clear without relying on color or animation alone.
  Trigger and stop buttons have at least 44 × 44 CSS pixel touch targets,
  visible keyboard focus, and accessible names that state the action, Set, and
  Layer (names may repeat).
  Volume sliders have Layer-specific labels and expose their current numeric
  values. Live updates must preserve keyboard focus and announce relevant
  playback-state changes without repeated, noisy announcements.
  **Retry audio** has a visible keyboard focus and an accessible name identifying
  the Set and Layer; a mixed Playing/Blocked tile exposes its blocked count in text.

### Playback failures

- Each Set instance plays one Sound at a time. A source's natural end advances to the
  next Sound in its current pass; a source failure advances immediately except for
  a browser-blocked start (below). A pass with no completed Sounds stops that
  instance, including when Loop is enabled. See PRD 03 for pass snapshots,
  loop boundaries, and live Set edits.
- A Set tap attempts playback immediately using that tap as the browser gesture;
  no separate enable-audio step is required. If browser gesture policy blocks
  Howler or the YouTube iframe, keep the affected instance active at that same
  Sound, show **Blocked** or a blocked count plus a plainly labeled **Retry audio**
  action, and leave Stop available. Retry is
  a fresh GM tap that attempts only that Set's blocked instances; it does not
  re-trigger the Set, add a stack instance, or advance the pass. Do not auto-retry
  silently, call the Sound errored, or persist an error for a gesture block. A
  bounded start attempt must resolve to audible playback or actionable feedback;
  the UI must not show Starting indefinitely after a browser rejects or suppresses
  playback. Howler's unlock and YouTube's iframe activation must be handled
  separately behind the player status seam.
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
  never spin through an empty loop or silently retry after membership changes. The GM
  can trigger it again. Keep a fixed-size **No playable Sounds** status on the
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

- Per-layer volume is adjustable live across every active Set instance in that
  Layer. The Program applies each change immediately to the current source of
  each instance; a source created later starts at that Layer's current volume.
  Debounced writes persist the latest integer value through `PATCH /api/layers/{id}`.
  A failed write leaves the local mix unchanged, marks the value **Unsaved**, and
  offers Retry. The local value survives in-app navigation; reload starts from
  the last saved value (see PRD 02). The unsaved warning and Retry remain
  accessible while another view is open. Configuration edits in that tab must
  use the Program's current volume, so saving an unrelated Layer field cannot
  silently overwrite a pending or failed live volume change.
- No master-volume slider ships in the Session view at launch.

### Session chrome

- Keep the app's normal navigation and the global **Stop all** action. The
  prototype's Program readout, session clock, list/grid switch, and inline
  playback-mode controls do not ship at launch.

### Browser and device behavior

- Foreground Session playback is required on the supported [browser/OS matrix](../dev-setup.md#m3-browser-and-device-qa),
  including uploaded files, YouTube Sounds, mixed-source passes, concurrent Sets,
  live Layer volume, and Stop. A first tile tap is the initial user gesture; a
  blocked start may require the explicit Retry audio tap described above.
- Playback after switching apps or locking a phone is best effort, including for
  mixed file/YouTube Sets. On return to the page, reconcile actual source status
  with the Program; do not leave a stale Playing indicator for silent audio.
  Show the affected Set and a user-tap recovery path if playback was interrupted.
  Never start or resume audio automatically on return from the background.
- The existing YouTube driver uses an off-screen 1 × 1 iframe for audio-only use.
  This conflicts with the documented YouTube minimum player size and visible
  controls constraint in the [mobile browser research](../research/m3-mobile-browser-audio.md).
  Keep this presentation for the M3 candidate, but validate foreground playback
  on every supported combination. If it fails, block launch and revisit the
  presentation or support decision; do not silently claim the combination works.

### Control model

- **Single active controller** — the GM drives playback from one device; playback state (the Program) lives in that client. Running two controller views at once is unsupported (double audio). See ADR-0003.
- **No resume across reload** — reloading or crashing the tab stops all audio; the Program is not persisted or auto-resumed. The GM re-triggers what they want.
- **Program lifetime** — one Program belongs to the active browser tab, above the
  individual views. It keeps playing while the GM navigates between Session,
  Sound Library, and Layers & Sets in that tab. Closing or reloading the tab
  stops and disposes it. Another tab does not share or synchronize its Program.
- **Program interface** — the Session view sends `triggerSet(layerId, setId)`,
  `stopSet(layerId, setId)`, `retryBlockedSet(layerId, setId)`, `stopAll()`, and
  `setLayerVolume(layerId, value)`;
  the configuration owner calls `applySavedConfiguration(change)` only after
  a successful save or reorder. `subscribe()` supplies change notifications,
  and `dispose()` ends the Program's lifetime. Subscribers read
  an immutable snapshot keyed by Layer and Set IDs: tile state, active instance
  count, blocked instance count, current Layer volume and save state, and notices.
  Views do not own
  source players or reconstruct playing state on mount. The Program owns each
  Set instance's pass runner and creates one `AudioSourcePlayer` at a time per
  instance. Its internal player subscriptions drive status and pass advancement.
- **Instance ownership** — an instance is active from trigger through startup,
  playback, and pass transitions. `stopSet` stops all its instances;
  `stopAll` stops every instance in every Layer. Stop, natural completion,
  failure, deletion, and mode-enforcement cuts each release the instance's
  player and subscription. They cancel pending membership/source work; late
  results and player callbacks cannot create audio or revive a stopped instance.
  A stopped instance is removed from the active count. The Program aggregates
  status across the remaining instances: Playing if any is playing, otherwise
  Starting if any is loading, otherwise Blocked if any awaits a user gesture,
  otherwise Stopped. Stop all is effective during startup, a block, or between
  Sounds. A blocked instance keeps its player and current pass position until
  Retry or Stop; Retry cannot create a new instance.
- **Saved configuration** — successful edits in the same tab update Session
  names, order, mode, and volume immediately, whether Session is visible or
  hidden. Unsaved settings drafts and failed saves have no effect. Deleting a
  Set stops and disposes all its instances; deleting a Layer does the same for
  every Set in it. Changing a Layer to `single` retains only its oldest active
  instance by trigger order; changing from `self_stacking` to `multiset` retains
  only the oldest active instance per Set. Other mode changes do not start or
  restart audio.
  Set membership, Shuffle, and Loop changes follow PRD 03's pass rules.
  Changes from another tab are outside the single-controller model.

## Out of scope (launch)

- Passive listeners / sharing audio with players (future; one-way broadcast, per-listener volume).
- Real-time multi-device sync / WebSockets.
- Transition effects (future).
- Stream Deck support (future).

## Open questions

- _(none)_
