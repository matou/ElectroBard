# Single controlling client; passive listeners are a one-way broadcast

The GM is the sole **controller** of playback for the entire life of the project: only the GM decides *what plays* (triggers sets, loop/shuffle, playback mode). At launch ElectroBard is **single-active-controller** — the GM drives audio from one device, playback state lives only in that client (see [[client-side-audio]]), and the backend is a plain REST/CRUD service with no real-time layer. Running two controller views at once is unsupported (double audio).

A planned future feature adds passive **listeners**: players who open a link shared by the GM, whose devices play the same program the GM triggered. No account required. Listeners can only adjust **their own mix** (overall + per-layer volume) in their own browser/device; they never change what is played.

## Consequences

- **Playback separates into two layers** that the vision had conflated:
  - *What's playing* — the program, authoritative, owned by the GM. Delivering it to listeners requires server-authoritative playback state pushed in real time (WebSockets), with each listener's browser running its own audio engine. This is the same machinery as the future "share audio with players" feature — deferred together.
  - *How it's mixed for me* — per-listener volume, applied locally on each device.
- **Per-layer volume is conceptually per-listener, not a global Layer property.** At launch there is one listener (the GM), so it collapses to the GM's mix.
- The listener broadcast is **one-way** (GM → listeners); control is never bidirectional. This keeps the future feature far simpler than general multi-device sync.
- No WebSockets / real-time infrastructure at launch.
