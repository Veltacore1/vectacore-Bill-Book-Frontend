# VastraBook Frontend

React + TypeScript + Vite frontend for **VastraBook by Veltacore**, a multi-tenant textile billing and inventory application.

## Scripts

```bash
npm install
npm run dev
npm run build
```

The app expects the backend API URL from `VITE_API_URL`. In local development it defaults to `http://127.0.0.1:8001/api/v1`.

Copy `.env.example` to `.env.local` for local development or configure the same variables in CI/CD.

Authentication uses short-lived access tokens in memory plus the backend's HttpOnly refresh cookie. The frontend obtains a CSRF token from `/auth/csrf` and sends it as `X-CSRFToken` on unsafe requests. The API origin must allow credentials for the frontend origin (`CORS_ALLOW_CREDENTIALS=True` on the backend, with `CORS_ALLOWED_ORIGINS` set to the deployed app URL).

## CI/CD

GitHub Actions are included:

- `Frontend CI`: installs dependencies, runs ESLint, builds the Vite app, and uploads the `dist` artifact.
- `Frontend Container CD`: builds and publishes a production Nginx image to GitHub Container Registry on `main`, tags, or manual dispatch.

Set the repository variable `VITE_API_URL` in GitHub before production builds so the static bundle points to the deployed backend API.

The production Nginx image serves immutable static assets, keeps the SPA shell uncached, and sends baseline security headers including CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

Published image:

```text
ghcr.io/veltacore1/vectacore-bill-book-frontend
```
