# One client-owned Program coordinates live playback

The active browser tab owns one Program above its views. It coordinates Set instances,
uses `AudioSourcePlayer` for each current Sound, and exposes commands plus an immutable
read snapshot to the UI. This keeps source lifetime, hard cuts, mode limits, volume
routing, and late-callback cancellation in one place while playback continues through
in-app navigation. The backend owns configuration and durable volume, but has no
transport or Program state (ADR-0003); reload ends playback without resume.

The Program treats each trigger as a Set instance. Single mode permits one active
instance per Layer, multiset one per Set, and self-stacking any number per Set.
Saved mode changes enforce those limits immediately, retaining the oldest active
instance when a limit shrinks. A single-mode trigger cuts existing playback before
the new Set starts, even if startup fails. Stop and disposal cancel pending work,
so asynchronous membership responses and source callbacks cannot revive audio.
Successful same-tab configuration edits update the Program; drafts do not. See
[PRD 04](../prd/04-session-view.md) for the full observable behavior.
