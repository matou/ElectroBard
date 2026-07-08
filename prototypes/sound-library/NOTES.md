# Sound Library prototype — answers

The prototype existed to answer four questions (issue #21). It carried three
variants — Catalog rows / Sound cards / Index+detail — each betting differently
on the four backend pressures. **The GM chose Catalog rows.** The losing
variants + the switcher/pressure-dock were removed; only the chosen direction
remains in `index.html`.

These are **soft inputs** to the M1 backend tickets (#20), not final API
decisions — but they set the leaning. Fold into the backend tickets as they land.

## Q1 — Does the list show duration? → **YES (column)**

- Shown as a right-aligned Duration column; a core part of the row.
- **Feeds:** confirms **upload duration extraction is needed** (risks R7 / Q11) —
  without it every uploaded file shows a blank cell.

## Q2 — Does preview need a scrubber / seek? → **NO**

- Preview is play/stop with a **non-interactive progress bar** — no seek handle.
- **Feeds:** `GET /audio` can **skip HTTP Range support** — stream the whole
  file. Lifts the map's "does /audio need range?" fog toward *no*. (Revisit only
  if a later surface — e.g. long-file scrubbing — demands it.)

## Q3 — How is an errored sound shown? → **INLINE in the row**

- The row stays in place, desaturates; Duration → "Unavailable" pill; the reason
  + a "↻ Recheck" link sit under the title. Play control becomes "✕ Errored".
- **Feeds:** smallest errored surface — `is_errored` flag + a reason string on
  the Sound + a recheck action. No separate errored list/section needed.

## Q4 — Add-YouTube feedback when embedding is blocked? → **WARN + SAVE ANYWAY**

- Inline amber warning under the URL field: the video blocks embedding, ElectroBard
  can't play it; **"Add anyway"** saves it as errored (skipped in sets), or Cancel.
- **Feeds:** add-time embeddability check returns a **soft** warning, not a
  rejection. A blocked video is stored as errored — so **blocked ≡ later-errored,
  one code path**. Add endpoint accepts blocked videos and flags them.

---

## Net for the backend tickets

Catalog rows is the **lightest, internally-consistent** backend: duration column
(needs extraction), **no** `/audio` range support, inline `is_errored`+reason,
and a single errored path shared by blocked-YouTube. Carry these leanings into
the Duration, `GET /audio`, Errored-sound, and YouTube-add-flow tickets.
