# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`vastrabook-frontend` — a React 19 + TypeScript + Vite SPA for **VastraBook by Veltacore**, a multi-tenant
textile billing and inventory app. It is the frontend for a separate Bill-Book backend (Django REST API,
PostgreSQL-backed); this repo contains only the frontend and its production Nginx image build.
Repo: `github.com/Veltacore1/vectacore-Bill-Book-Frontend`.

## Commands

```bash
npm install            # install dependencies (CI uses `npm ci`)
npm run dev            # Vite dev server (HMR)
npm run build          # type-check project refs (tsc -b) then `vite build` -> dist/
npm run preview        # serve the built dist/ locally
npm run lint           # eslint . (flat config, eslint.config.js)
npm run test           # vitest run (one-shot, jsdom)
npm run test:watch     # vitest watch mode
```

Type-checking is part of `npm run build` (`tsc -b` across the `tsconfig.app.json` / `tsconfig.node.json`
project references); there is no standalone `typecheck` script. `tsc` is `--noEmit`; Vite produces the bundle.

Run a single test:

```bash
npx vitest run src/components/StaffAttendance.test.tsx        # one file
npx vitest run -t "name of the test"                          # by test name (-t)
npx vitest src/components/StaffAttendance.test.tsx            # watch a single file
```

Tests live next to source as `*.test.tsx` / `*.spec.tsx` (config `include: src/**/*.{test,spec}.{ts,tsx}`).
Vitest uses `globals: true`, `environment: jsdom`, `setupFiles: ./src/test/setup.ts` (imports
`@testing-library/jest-dom/vitest`). `vitest.config.ts` aliases `css.escape` to `src/test/cssEscapeShim.js`.

ESLint flat config extends `js.recommended`, `typescript-eslint.recommended`, `react-hooks` (flat
recommended), and `react-refresh` (vite). Notable: `@typescript-eslint/no-explicit-any` is off and several
`react-hooks` rules (`preserve-manual-memoization`, `purity`, `set-state-in-effect`) are disabled. `dist`
is globally ignored.

## Architecture

**Framework / build.** React 19 (`react`/`react-dom` 19) with `@vitejs/plugin-react`. `vite.config.ts` is
intentionally minimal (just the React plugin). Entry is `index.html` -> `src/main.tsx`, which mounts
`<App/>` inside an `AppErrorBoundary` (`src/components/AppErrorBoundary.tsx`) in `StrictMode`. The only
runtime deps besides React are `lucide-react` (icons).

**Routing / app shell.** No router library. `src/App.tsx` is a single large stateful component that does
hand-rolled routing off `window.location` + `history.pushState`/`popstate`:
- Top-level views are chosen by path/query: public shared-ledger (`/shared-ledger/:token`), landing page
  (`LandingPage`), auth (`/login`, `/register` -> `TenantOnboarding`), and the authenticated workspace
  (`/app?tab=...`).
- Within the workspace, the active screen is a string `activeTab`; `TAB_MODULES` maps each tab to a
  permission module key, and `canViewTab`/`modulePermissions` gate tabs by the tenant user's role.
  `navigateToTab` updates both state and URL.
- Workspace feature screens are `React.lazy` + `Suspense` code-split (Dashboard, Items, Parties,
  SalesInvoices, SalesRegisters, Purchases, Reports, AccountingSolutions, BusinessTools, POSBilling,
  Settings, SharedLedger, Godown, etc.).

**State management.** No Redux/Zustand/Context store. All workspace domain state lives in `useState` hooks
in `App.tsx` and is hydrated in one shot from `getWorkspace()` (`GET /auth/workspace`) into
`loadTenantWorkspace`. A polling loop (`WORKSPACE_REALTIME_INTERVAL_MS = 15000`, plus
`focus`/`visibilitychange`) re-fetches the whole workspace to act as pseudo-realtime sync; a
`realtimeStatus` chip reflects connecting/live/syncing/error. Mutations call API functions then re-run
`loadTenantWorkspace()` to refresh.

**API client layer (`src/api/`).** The hub is `src/api/core.ts`; `src/api.ts` re-exports `src/api/index.ts`,
which barrels all domain modules: `auth`, `workspace`, `parties`, `items`, `sales`, `purchases`,
`payments`, `accounting`, `staff`, `business-tools`, `settings`. Core provides `apiFetch` (JSON,
auth+retry), `publicApiFetch` (unauthenticated), `apiText`, `apiBlob` (file/print exports), plus
date/payment-mode mappers and `SalesRegister` payload helpers.

Auth/security model (`core.ts`):
- Base URL from `import.meta.env.VITE_API_URL`, default `http://127.0.0.1:8001/api/v1` in dev; trailing
  slash stripped.
- Short-lived **access token kept in memory only** (`accessTokenCache`); the backend holds an **HttpOnly
  refresh cookie**. `localStorage` only stores a non-sensitive `vastrabook_session_active` marker (plus
  migration cleanup of legacy `csm_silks_*` keys).
- All requests use `credentials: "include"`. On `401`, `authenticatedFetch` refreshes via
  `POST /auth/token/refresh` once, then retries; failure clears the session.
- **CSRF:** unsafe methods send `X-CSRFToken`, sourced from the `csrftoken` cookie or fetched from
  `GET /auth/csrf`. The backend must allow credentialed CORS for the frontend origin.
- Optional demo session (`POST /auth/demo-session`) gated by `VITE_DEMO_SESSION` (enabled by default in dev
  unless set to `"false"`).
- Responses are unwrapped through `readJson`, which treats `{ success: false }` or non-2xx as errors using
  the server `message`.

**`src/` layout.**
- `main.tsx`, `App.tsx` — entry + app shell/router/state.
- `api.ts`, `api/` — API client (see above).
- `components/` — all UI: feature screens, `Sidebar`/`Topbar`, `LandingPage`, `TenantOnboarding`,
  `Chatbot`, `AppErrorBoundary`, shared-ledger views. Tests live here too (`StaffAttendance.test.tsx`).
- `types/index.ts` — shared domain types (`WorkspaceData`, `Business`, `Party`, `Item`, invoices,
  registers, permissions, etc.).
- `index.css`, `App.css`, `redesign.css` — global styles (no CSS-in-JS; Inter/Outfit fonts in `index.html`).
- `assets/`, `public/` — static assets; `test/` — vitest setup + shim.

## Env vars

`.env.example` (copy to `.env.local` for dev):
- `VITE_API_URL` — backend API base, e.g. `https://api.vastrabook.in/api/v1`. Dev default
  `http://127.0.0.1:8001/api/v1`. **Baked into the static bundle at build time.**
- `VITE_DEMO_SESSION` — `true`/`false` to force the demo-session flow.
- `ALLOW_HTTP_TESTING` — build-time-only escape hatch; when `"true"`, relaxes the production-env validator
  to permit localhost/HTTP API URLs.

## Production image / Nginx runtime

`Dockerfile` is a two-stage build (`node:20-alpine` -> `nginx:1.27-alpine`):
1. `npm ci`, then with `VITE_API_URL`/`ALLOW_HTTP_TESTING` as build args, runs
   `npm run verify:prod-env && npm run render:nginx && npm run build`.
2. Copies `build/nginx/default.conf` and `dist/` into the Nginx image. Exposes `80`, `wget` healthcheck on `/`.

- `scripts/validate-production-env.mjs` (`verify:prod-env`) **rejects missing, localhost, or non-HTTPS
  `VITE_API_URL`** unless `ALLOW_HTTP_TESTING=true`.
- `scripts/render-nginx-config.mjs` (`render:nginx`) renders `nginx.conf.template` to
  `build/nginx/default.conf`, substituting `__VASTRABOOK_API_ORIGIN__` with the validated API origin so the
  CSP `connect-src` allows only `self` + that origin.
- `nginx.conf.template` serves the SPA: immutable long-cache for hashed assets, `no-store` for the
  `index.html` shell, SPA fallback (`try_files ... /index.html`), and security headers (CSP,
  `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

## CI/CD (GitHub Actions)

- `.github/workflows/ci.yml` (**Frontend CI**) — on push to `main`, PRs, manual: secret-scan self-test
  (`scripts/check_no_secrets.py`), `npm ci`, `npm run lint`, `npm run build`, render Nginx config, validate
  it with `nginx -t` in a container, upload `dist` artifact. `VITE_API_URL` comes from a repo var or
  defaults to localhost. **CI does not run `npm run test`.**
- `.github/workflows/container.yml` (**Frontend Container CD**) — on push to `main` / `v*` tags / manual:
  validates `VITE_API_URL` (must be set, HTTPS, non-localhost), builds and pushes the Nginx image to
  **GHCR** as `ghcr.io/veltacore1/vectacore-bill-book-frontend` (tags: branch, tag, `sha-<sha>`, `latest`
  on default branch). The production API URL is passed as a build arg from the repo variable `VITE_API_URL`.

`scripts/check_no_secrets.py` fails CI if Git-tracked files contain likely provider credentials; it scans
tracked files only and reports pattern name/location, never the value, so local ignored `.env*` files can
hold dev secrets.

## Relationship to the wecrew kind cluster

This repo's own pipeline publishes to **GHCR** (`ghcr.io/veltacore1/vectacore-bill-book-frontend`), not to
the cluster's Harbor — there are **no Harbor references, no `k8s/` deploy manifests, and no ingress
definitions in this repo**. Any deployment onto the `wecrew` cluster is driven from outside this repo (see
`/root/CSM-Projects/k8s/`). The image is a self-contained Nginx SPA server (port 80); `VITE_API_URL` is
baked at build time and must point at the deployed backend API origin (which must allow credentialed CORS +
CSRF for the frontend host). Confirm intended image name / ingress host before wiring any new deployment.

## Conventions

- Never commit secrets; CI enforces this. Configure `VITE_API_URL` (and optional `VITE_DEMO_SESSION`) via
  `.env.local` locally or repo variables in CI. `VITE_API_URL` is build-time-baked, so the image is
  API-origin-specific.
- Keep the access token in memory only; rely on the HttpOnly refresh cookie + CSRF flow already implemented
  in `src/api/core.ts` — don't persist tokens to `localStorage`.
- New backend calls go in the matching `src/api/<domain>.ts` module and are re-exported through
  `src/api/index.ts`; use `apiFetch`/`publicApiFetch`/`apiText`/`apiBlob` rather than raw `fetch`.
- New workspace screens: add the tab to `TAB_MODULES` (with its permission module key) in `App.tsx`,
  lazy-import the component, and render it under the appropriate `activeTab` branch.
