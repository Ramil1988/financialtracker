# Financial Tracker

A simple, single-file financial tracker to manage assets, liabilities, and track net worth over time.

## Files

- `financial_tracker.html` — Main app (open in a browser)
- `server/` — Express API with Auth0 JWT auth and JSON storage

## Quick Start

1. Open `financial_tracker.html` in your browser.
2. Enter your assets and liabilities.
3. Save snapshots and export CSV when needed.

## Backend (Node/Express)

Prereqs: Node 18+

1) Configure environment

- Copy `server/.env.example` to `server/.env` and fill:
  - `AUTH0_ISSUER_BASE_URL` (e.g. `https://YOUR_DOMAIN.auth0.com/`)
  - `AUTH0_AUDIENCE` (custom API identifier you set in Auth0)
  - `ALLOWED_ORIGINS` (comma-separated origins for CORS, e.g. `http://localhost:8080`)

2) Install and run

```
cd server
npm install
npm run dev
```

API will start at `http://localhost:8080`.

### API Endpoints

- `GET /health` — health check
- `GET /api/me` — requires Auth0 Bearer token; returns token subject
- `GET /api/snapshots` — list snapshots for current user
- `POST /api/snapshots` — body: `{ snapshot: { date, totalAssets, totalLiabilities, netWorth, ... } }`
- `DELETE /api/snapshots/:date` — delete snapshot by date

Data is stored per-user (by `sub`) in `server/data/data.json`.

### Auth0 Setup (SPA + API)

1. Create an API in Auth0
- Identifier: `https://financial-tracker.api` (or your choice)
- Signing Algorithm: RS256

2. Create a Single Page App in Auth0
- Allowed Callback URLs: your app origin (e.g., `http://localhost:8080`)
- Allowed Web Origins: same as above
- Allowed Logout URLs: same as above

3. Frontend integration (example with Auth0 SPA SDK)

Include Auth0 SDK and initialize:

```
<script src="https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js"></script>
<script>
  let auth0Client;
  async function setupAuth() {
    auth0Client = await createAuth0Client({
      domain: "YOUR_DOMAIN.auth0.com",
      clientId: "YOUR_CLIENT_ID",
      authorizationParams: {
        audience: "https://financial-tracker.api",
      },
      cacheLocation: "localstorage"
    });
  }
  setupAuth();

  async function apiFetch(url, options={}) {
    const token = await auth0Client.getTokenSilently({
      authorizationParams: { audience: "https://financial-tracker.api" }
    });
    return fetch(url, { ...options, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers||{}) }});
  }
  // Save snapshot example:
  // await apiFetch("http://localhost:8080/api/snapshots", { method: "POST", body: JSON.stringify({ snapshot }) })
</script>
```

Replace localStorage usage with calls to the API endpoints once Auth0 is wired up.

## Netlify + MongoDB (Serverless)

This repo also includes a Netlify Functions API backed by MongoDB Atlas and protected by Auth0.

Files:
- `netlify/functions/api.js` — single function handling `/api/*` routes
- `netlify.toml` — redirects `/api/*` to the function
- Root `package.json` — function dependencies (`mongodb`, `jose`)

Environment variables (set in Netlify UI > Site Settings > Environment):
- `MONGODB_URI` — your MongoDB Atlas connection string
- `MONGODB_DB` — database name (e.g., `financial_tracker`)
- `AUTH0_ISSUER_BASE_URL` — e.g., `https://YOUR_DOMAIN.auth0.com/`
- `AUTH0_AUDIENCE` — your API identifier in Auth0 (e.g., `https://financial-tracker.api`)
- `ALLOWED_ORIGINS` — comma-separated origins (e.g., `https://your-site.netlify.app,http://localhost:8888`)

Deploy steps:
1. Create a repo (GitHub) and push this project.
2. In Netlify, New site from Git, select the repo.
3. Build settings:
   - Base directory: root
   - Build command: leave default or `npm install`
   - Publish directory: root (or ignore; we only need functions if deploying API-only)
4. Set environment variables listed above.
5. Deploy. API will be available at `https://<your-site>/.netlify/functions/api/...`, and via friendly routes `/api/...` thanks to `netlify.toml` redirects.

MongoDB Atlas (free tier) quick setup:
- Create a free cluster at https://www.mongodb.com/atlas/database
- Create a database user and password
- Network access: allow your server IPs (or 0.0.0.0/0 for dev only)
- Get the connection string and set it as `MONGODB_URI` (include db user/pass)

Endpoints (same as Express version):
- `GET /api/health` — health check (no auth)
- `GET /api/me` — returns `{ sub }` from token
- `GET /api/snapshots` — list user snapshots
- `POST /api/snapshots` — body: `{ snapshot: { date, totalAssets, totalLiabilities, netWorth, assets?, liabilities? } }`
- `DELETE /api/snapshots/:date` — delete by date

Frontend notes:
- Use Auth0 SPA SDK in `financial_tracker.html` to obtain a token for the configured audience.
- Call `/api/*` endpoints with `Authorization: Bearer <token>`.
- For local testing with Netlify CLI: `npm i -g netlify-cli && netlify dev` then hit `http://localhost:8888/api/...`.

## Export

- Exports a detailed CSV with current snapshot and historical data.

## License

Private use.
