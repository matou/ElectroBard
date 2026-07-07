# API client

The typed client here is **generated** from the backend's OpenAPI schema — never
hand-written (tech-stack.md). Generation is wired in #8 (`npm run gen:api`), and CI
diffs the regenerated client against the committed one so the API and its client can't
drift (dev-setup.md).

Generated output lands under `src/api/generated/` (gitignored until #8 decides whether
to commit it). UI/state code imports from here and **mocks it** in component tests;
the client itself isn't unit-tested.
