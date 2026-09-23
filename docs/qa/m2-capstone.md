# M2 integration and QA capstone (#73)

The repeatable browser journey is `cd frontend && npm run test:e2e` against the
clean Compose stack described in [dev-setup](../dev-setup.md#m2-browser-journey).
It exercises React, the generated client, FastAPI, and Postgres. Its membership
assertions run without any preview or playback action.

## QA record (2026-09-23)

- Fresh Compose database applied migrations and provisioned Music, Ambience, and
  Sound Effects once. Browser journey passed with file and YouTube Sounds, two
  overlapping Tags, OR membership with no duplicates, name ordering, tagless and
  no-match states, reorder, reload, and destructive cascade checks.
- Backend API suite passed (206 tests), including existing-User migration
  backfill, foreign tenant access, ordering invariants, and errored Sound
  visibility. Frontend suite passed (138 tests); lint, typecheck, and client drift
  checks passed.
- Inspected desktop (1280 px) and mobile (390 px) screenshots of Layers & Sets.
  Navigation, outline, and settings stayed usable with no horizontal overflow;
  inputs had programmatic labels and Session was visibly unavailable. No M3
  playback control appeared in Layers & Sets. Sound Library remained reachable.
- Follow-up outside M2: [#84](https://github.com/matou/ElectroBard/issues/84)
  tracks the small mobile reorder touch targets.

The manual pass covers layout and visible controls at these two sizes. Browser
audio playback and a wider device matrix belong to the later release QA bar.
