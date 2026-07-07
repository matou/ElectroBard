"""Dump the app's OpenAPI schema to stdout as deterministic JSON.

This is the source of truth the frontend client is generated from (dev-setup, #8).
It builds the schema straight from the app object — no running server needed — so
both `gen:api` and the CI drift gate can regenerate offline. Keys are sorted and a
trailing newline is emitted so the committed `openapi.json` diffs cleanly.

Usage: `uv run python -m scripts.export_openapi > ../frontend/openapi.json`
"""

import json
import sys

from app.main import create_app


def main() -> None:
    schema = create_app().openapi()
    json.dump(schema, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
