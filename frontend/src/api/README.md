# API client

The typed client under `generated/` is **generated** from the backend's OpenAPI
schema — never hand-written (tech-stack.md). Do not edit those files.

## Regenerating

```
npm run gen:api      # dump backend schema -> openapi.json, then generate the client
```

`gen:api` runs two steps (see `package.json`):

1. `gen:schema` — `uv run --directory ../backend python -m scripts.export_openapi`
   writes the live schema to `openapi.json`.
2. `openapi-ts` — generates `generated/` from it (config: `openapi-ts.config.ts`).

Both `openapi.json` and `generated/` are **committed**. Change a backend endpoint →
run `gen:api` → commit the result.

## Drift gate

```
npm run check:api    # regenerate and fail if it differs from what's committed
```

CI runs this (wired in #10): the regenerated client must match the committed one
(lockfile-style), so the API and its client can't drift on `main` (dev-setup.md).

## Usage

UI/state code imports the named operation functions (e.g. `listSounds()`) and types
(e.g. `SoundRead`) from `generated`, and **mocks them** in component tests. The client
itself isn't unit-tested — generation + the drift gate are its guarantee.
