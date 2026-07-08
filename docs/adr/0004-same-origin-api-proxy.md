# Same-origin API access via a dev-server proxy (no CORS)

The browser reaches the API on a **single origin**. In development the frontend (Vite) dev server proxies every `/api` request to the backend, and the generated API client calls **relative** URLs (`/api/...`). Because the request never crosses an origin from the browser's point of view, the backend runs **no CORS** — no middleware, no allowed-origins list. The rejected alternative was to have the browser call the backend cross-origin and open a CORS gate on FastAPI.

## Consequences

- **No CORS surface on the backend.** No `CORSMiddleware`, no allowed-origins setting to keep in sync across dev / LAN / prod — one fewer classic "works in dev, breaks in prod" failure mode.
- **The generated client stays config-free.** It uses relative `/api/...` URLs, so there is no `baseUrl` to wire at startup and no risk of a doubled `/api` prefix.
- **Dev topology mirrors the intended prod shape.** Launch serves the SPA and its API behind one origin with `/api` routed to the backend; the dev proxy is the same arrangement, so dev ≈ prod.
- **One knob: `VITE_API_PROXY_TARGET`.** It points the proxy at the backend — the `backend` service over the compose network in the stack, the local backend when running standalone. The proxy runs **server-side** in the dev server, so it uses the compose service name, not the browser-facing host.
- **Production still needs its own single-origin reverse proxy.** The Vite proxy only shapes development; a real deployment must preserve the single origin itself. That is out of M0 scope.

## Alternatives considered

- **Cross-origin call + CORS.** The browser calls the backend directly (e.g. `:8000`) and FastAPI adds `CORSMiddleware` with an allowed-origins setting. Rejected: it adds config surface, is a common source of environment-specific breakage, and diverges from the single-origin prod shape — which would want a proxy anyway. Its only real pull was matching an earlier scaffolding comment, not a technical advantage.
