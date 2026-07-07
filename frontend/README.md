# ElectroBard — frontend

React + TypeScript app (Vite). See [tech-stack](../docs/tech-stack.md) and
[dev-setup](../docs/dev-setup.md).

## Commands

| Command | What |
|---|---|
| `npm run dev` | Start the dev server (HMR). |
| `npm run build` | Typecheck + production build. |
| `npm run typecheck` | `tsc --noEmit` only. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest (component/logic tests). |

## Layout

- `src/audio/AudioSourcePlayer.ts` — the playback seam the UI drives (Howler + YouTube
  IFrame behind one interface). Implementations land in M3; component tests mock it.
- `src/api/` — the **generated** OpenAPI client (wired in #8); never hand-written.

Env vars: see the repo-root `.env.example` (`VITE_`-prefixed vars reach the browser).
