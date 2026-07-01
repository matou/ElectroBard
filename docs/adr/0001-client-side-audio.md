# Client-side audio playback and mixing

The GM's browser is the audio engine: uploaded files stream from the server and play/mix via the Web Audio API, and YouTube sources play in an embedded iframe in the same browser. The backend stores the library, layer/set configuration, and uploaded files, but never decodes or mixes audio. We chose this over a server-side mixer because YouTube sources must play in-browser (we deliberately do not extract their audio), and at launch the only listener is the GM's own machine, so server-side mixing adds large complexity for no benefit.

## Consequences

- The **audio source abstraction is metadata-level, not playback-level.** Uploaded files (fully controllable Web Audio nodes — volume, loop, fade) and YouTube sources (a coarse iframe that can only start/stop/setVolume) are played by different mechanisms and cannot be mixed or crossfaded identically. The abstraction holds for library/organization concerns and leaks at playback concerns. See [[audio-source]].
- Playback state (what is playing, per-layer volume) lives in the client, not the server.
