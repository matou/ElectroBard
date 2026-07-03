# Prototype: Session View — Cue Console

A session view prototype, built with the `frontend-design` skill. 

## The idea

ElectroBard's Session View is a **live board a GM plays during a game**, not a
dashboard. So this version treats it as a **stage manager's cue console** — the
theatrical sound/lighting board an operator fires "cues" from during a live
show. The GM runs the cues for their table's story.

**Signature:** each set is an **engraved cue lamp** that stays dark until fired,
then **ignites in its layer's lighting-gel colour** (inner bloom, lit lamp, a
little VU meter). That's the one bold element; everything around it stays matte
and quiet.

### Design choices (and why they're not the AI default)

- **Warm candlelit ink**, not neutral black: base `#14100c`, warm ivory text.
- **Per-layer lighting gels** instead of one accent — Music = amber, Ambience =
  steel-cyan, SFX = rose. Firing a cue "turns that channel's light on".
- **Serif for the story, mono for the machine:** cue and layer names in a
  Palatino/Georgia serif (playbill / spellbook); every label, number, tag and
  time in monospace (a patch sheet). Offline-safe system fonts — no network.
- **Rack layout:** full-width channel racks stacked vertically (engraved header
  + fader + a grid of cue lamps), not a three-column card grid.
- **One orchestrated motion moment:** a "power-on self-test" blinks the lamps on
  load; otherwise just hover pre-heat and the live bloom. Respects
  `prefers-reduced-motion`.

## What it includes (from the PRDs)

Everything [PRD 04](../../docs/prd/04-session-view.md) and
[PRD 02](../../docs/prd/02-layers.md) call for:

- **All layers visible at once**, each with a **per-set cue button showing
  playing / stopped** and its own **volume fader**.
- **Playback modes**, switchable per layer:
  - **Single** — firing a cue hard-cuts the others in that layer.
  - **Multiset** — cues mix.
  - **Self-stacking** — tapping a cue **always adds an instance**; it shows a
    **×N stack badge** and a **✕ stop-all** control (no per-instance stop, per
    PRD 04). Sound Effects ships in this mode.
- **Main volume** fader in the master section.
- **Program** — an "ON AIR" scribble-strip readout of every live cue (with stack
  ×N).
- **Single controller · no resume across reload** — a ticking LIVE session clock
  makes the point; all state is in-memory and resets on reload.
- Plus carried-over niceties: **fixed-size tiles** (never resize when fired) and
  a **per-layer List / Grid** view toggle (SFX defaults to Grid).

## What it deliberately does NOT do

- **No audio plays.** "Live" is faked with the lamp bloom + VU meter.
- **No server, no persistence.** In-memory only; reload resets it (as intended).

## How to use

```
open prototypes/session-view/index.html
```

No build step, no dependencies, no network needed.

## Domain vocabulary

Follows `CONTEXT.md`: **Layer** (channel/rack), **Set** (the "cue"), **Sound**,
**Playback mode** (single / multiset / self-stacking), **Program** (what's live),
**Controller** (the GM).
