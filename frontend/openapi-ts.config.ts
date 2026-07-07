import { defineConfig } from '@hey-api/openapi-ts'

// Generates the typed API client from the backend's committed OpenAPI schema
// (produced by `gen:schema`). Output is checked in and kept in sync by the CI
// drift gate (dev-setup, #8) — never hand-edit files under the output path.
export default defineConfig({
  input: './openapi.json',
  output: {
    path: './src/api/generated',
    // No external formatter: hey-api's own output is deterministic, which is what
    // the lockfile-style drift check relies on (avoids a prettier dependency).
  },
  plugins: [
    '@hey-api/client-fetch',
    // SDK gives named operation functions (`listSounds()`) keyed off the route-name
    // operationIds; typescript gives the request/response types the UI imports.
    '@hey-api/sdk',
    '@hey-api/typescript',
  ],
})
