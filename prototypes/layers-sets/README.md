# Prototype: Layers & Sets configuration workspace

Throwaway UI study for [issue #54](https://github.com/matou/ElectroBard/issues/54).
It compares three ways a GM could organize Layers and tag-derived Sets without
suggesting that M3 live playback already exists.

## Run

```sh
open prototypes/layers-sets/index.html
```

No build, server, persistence, or audio. Use the floating switcher (or left and
right arrow keys) to compare:

- `?variant=A` — **Workbench:** layer rail, set list, persistent inspector.
- `?variant=B` — **Racks:** all layers expanded; edit directly in context.
- `?variant=C` — **Outline:** compact hierarchy plus a focused settings sheet.

Edits live only in memory and are shared while switching variants. “Reset data”
restores the sample workspace. The **Prototype state** panel exposes the full
current model.

## Question

Which navigation, information architecture, editing model, reorder interaction,
destructive-action treatment, and empty-state treatment should M2 use—and how
should it distinguish Sound Library inventory, configuration, and the future
Session performance surface?

This prototype is the question, not the answer. Record the chosen direction on
issue #54 before translating it into production requirements.
