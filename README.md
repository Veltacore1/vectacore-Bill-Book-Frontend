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

## CI/CD

GitHub Actions are included:

- `Frontend CI`: installs dependencies, runs ESLint, builds the Vite app, and uploads the `dist` artifact.
- `Frontend Container CD`: builds and publishes a production Nginx image to GitHub Container Registry on `main`, tags, or manual dispatch.

Set the repository variable `VITE_API_URL` in GitHub before production builds so the static bundle points to the deployed backend API.

Published image:

```text
ghcr.io/veltacore1/vectacore-bill-book-frontend
```
