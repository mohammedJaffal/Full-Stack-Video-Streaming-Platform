# StreamForge — Full-Stack Video Streaming Platform

A production-oriented portfolio application connecting an Astro/React frontend, a Rust/Axum API, MySQL, Redis background jobs, a Rust worker, and a Cloudflare Worker media relay.

## Features

- Public home, explore, details, and watch pages
- Responsive HLS playback with seeking, quality selection, subtitles, speed, volume, and fullscreen
- Short-lived signed playback sessions
- Cloudflare Worker manifest rewriting and protected segment relay with range forwarding
- Demo administrator login and protected dashboard
- Content create, edit, enable/disable, and delete flows
- Redis-backed metadata enrichment, subtitle import, and duplicate detection jobs
- Retry support, provider health, and system logs
- MySQL migrations and fictional seeded content
- Docker Compose and GitHub Actions checks

## Repository layout

```text
apps/web                 Astro + React frontend
apps/api                 Rust + Axum REST API
apps/worker              Rust Redis background worker
cloudflare/media-relay   Token-validating HLS relay
database/migrations      Schema and demo seed data
```

## Local setup

```bash
cp .env.example .env
# Replace JWT_SECRET and PLAYBACK_SIGNING_SECRET
docker compose up --build
```

Run the media relay separately:

```bash
cd cloudflare/media-relay
npm install
npx wrangler secret put PLAYBACK_SIGNING_SECRET
npm run dev
```

Use the same playback secret in the API and Worker.

Open:

- Web: `http://localhost:4321`
- API health: `http://localhost:8080/health`
- Admin: `http://localhost:4321/admin/login`

Demo credentials are configured through `.env` and default to `admin@example.com` / `demo12345` for local development only.

## Secure playback flow

1. The watch page creates a playback session through the Axum API.
2. The API validates content state and signs a short-lived token.
3. The Cloudflare Worker validates signature and expiry.
4. The Worker rewrites HLS manifest URIs through its protected relay.
5. Segment requests remain token-protected and preserve Range headers.

This is portfolio access control, not DRM.

## Validation

```bash
cargo fmt --all -- --check
cargo check --workspace
cd apps/web && npm install && npm run check
cd ../../cloudflare/media-relay && npm install && npm run check
```

The seeded player uses an openly available HLS test stream. Catalog titles, artwork, providers, and operational data are fictional demo content.
