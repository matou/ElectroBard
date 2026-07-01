# PRD 02 — Layers

## Overview

A Layer is a named, independently-mixed channel holding sets, with its own volume and playback mode. Ships with three ordinary starter layers (music, ambience, sound effects). Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- Free-form organization of sets into layers.
- Per-layer playback semantics and volume.

## Requirements

### Layer management

- Three **starter layers** on first run: music, ambience, sound effects. These are ordinary layers — no special behavior; can be renamed, reconfigured, deleted, recreated.
- GM can create, rename, delete, and reorder custom layers freely.
- Layer configuration **persists** between sessions.

### Playback mode (per layer)

- **Single set** — triggering a new set immediately stops the current one (hard cut, no transition at launch).
- **Multiset** — multiple sets play and mix.
  - **Self-stacking** (multiset refinement) — the same set can be triggered again to layer over itself.

### Volume

- Each layer has a volume the GM adjusts live.
- Volume is **persisted** as part of layer config (survives reload).
- Conceptually per-listener (see ADR-0003); at launch there is one listener (the GM), so it is simply the GM's mix.

## Out of scope (launch)

- Mute / solo per layer (future).
- Transition effects between sets (future; launch is hard cut).
- Per-listener mixes (future; requires the listener feature).

- New layers default to **80%** volume.

## Open questions

- _(none)_
