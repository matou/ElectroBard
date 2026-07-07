#!/usr/bin/env bash
#
# Drift gate (dev-setup.md, #8): regenerate the schema + typed client from the live
# backend app and fail if the result differs from what's committed — lockfile-style.
# This forces "changed an endpoint -> commit the regenerated client," so the API and
# its client can never drift on `main`. CI wires this in (#10).
#
# Both failure directions are covered: a schema change without a regenerated client,
# and a hand-edited generated file, each leave the working tree differing from HEAD.
set -euo pipefail

cd "$(dirname "$0")/.."

# Regenerate openapi.json and src/api/generated in place.
npm run --silent gen:api

# Anything modified or newly untracked under the generated artifacts means drift.
paths=(openapi.json src/api/generated)
changes="$(git status --porcelain -- "${paths[@]}")"

if [ -n "$changes" ]; then
  echo "error: the committed API client is out of sync with the OpenAPI schema." >&2
  echo "Run 'npm run gen:api' and commit the result. Drift:" >&2
  echo "$changes" >&2
  git --no-pager diff -- "${paths[@]}" >&2 || true
  exit 1
fi

echo "API client is in sync with the OpenAPI schema."
