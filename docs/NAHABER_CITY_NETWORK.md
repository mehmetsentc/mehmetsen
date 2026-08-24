# NaHaber City Network — Deployment & Setup Guide

## Overview

The City Network allows NaHaber to serve city-specific experiences on subdomains
(e.g. `canakkale.nahaber.com`, `antalya.nahaber.com`) — same codebase, different
content filtered by province. Everything is gated behind the `CITY_NETWORK_ENABLED`
feature flag.

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture audit | ✅ Complete |
| 1 | Drizzle schema + Neon DB + seed | ✅ Complete |
| 2 | R2 storage abstraction (`src/lib/storage/`) | ✅ Foundation ready |
| 3 | City middleware rewrite (all browsing paths) | ✅ Complete |
| 4 | Firebase citySlug feed + Postgres path | ✅ Complete |
| 5 | City UI (CityHeader, MobileNav, Feed, Spor, Events, Districts) | ✅ Complete |
| 6 | District sub-routes (`/ilceler/[slug]`) | ✅ Complete |
| 7 | Postgres news write pipeline (dual-write) | 🔲 Pending |
| 8 | Full R2 media migration | 🔲 Pending |
| 9 | Additional cities | ✅ Antalya live (hardcoded + seed); more cities pending |

## Architecture

```
canakkale.nahaber.com/feed (or / or /yerel)
        ↓
   middleware.ts — detects subdomain → resolves CityTenant
        ↓
   Sets x-nahaber-tenant / x-nahaber-province headers + cookie
        ↓
   Rewrites to /city-site (internal); /etkinlik → /city-site/etkinlik, etc.
   National-only paths (/discover, /kategori/*) → redirect to city home
        ↓
   city-site/ layout — reads tenant headers → renders CityLayoutClient
        ↓
   cityNewsService: Firebase (citySlug) OR Postgres (POSTGRES_READS_ENABLED)
```

### Route structure (city tenant)

| Public URL             | Internal rewrite              | Page                        |
|------------------------|-------------------------------|-----------------------------|
| `/`                    | `/city-site`                  | City main feed              |
| `/feed`               | `/city-site`                  | City main feed              |
| `/yerel`              | `/city-site`                  | City main feed              |
| `/etkinlik`           | `/city-site/etkinlik`         | City events                 |
| `/spor`               | `/city-site/spor`             | City sports news            |
| `/ilceler`            | `/city-site/ilceler`          | District list               |
| `/ilceler/gelibolu`   | `/city-site/ilceler/gelibolu` | District news feed          |
| `/haber/[slug]`       | (no rewrite — shared)         | News article (shared route) |
| `/kategori/*`         | → redirect to `/`             | Blocked on city subdomain   |
| `/discover`, `/skor`… | → redirect to `/`             | Blocked on city subdomain   |

Non-city paths (e.g. `/haber/[slug]`, `/search`, `/settings`) on city subdomains
fall through to the national site routes without rewrite (tenant headers still passed).

### National routes (unchanged)

When `CITY_NETWORK_ENABLED=false` or host is `nahaber.com` / `www.nahaber.com` /
`localhost`, the app behaves exactly as before. No city tenant is resolved.

---

## Local Development

### Option 1: Subdomain via /etc/hosts (recommended)

Add to `/etc/hosts`:

```
127.0.0.1  canakkale.localhost
127.0.0.1  antalya.localhost
```

Then visit: `http://canakkale.localhost:3000` or `http://antalya.localhost:3000`

> Most browsers resolve `*.localhost` without editing hosts. Try it first.

### Option 2: Query parameter fallback

Visit: `http://localhost:3000/?tenant=canakkale` or `http://localhost:3000/?tenant=antalya`

### Required environment variables

```env
CITY_NETWORK_ENABLED=true
# DATABASE_URL is optional — hardcoded fallback exists for canakkale + antalya
```

---

## Vercel Deployment

### 1. Add domain in Vercel

In your Vercel project dashboard → **Settings → Domains**, add:

- `canakkale.nahaber.com`
- `antalya.nahaber.com`

Or for wildcard (all future city subdomains):

- `*.nahaber.com`

### 2. DNS — CNAME record

At your DNS provider (e.g. Cloudflare, Google Domains), add:

| Type  | Name        | Target              | TTL  |
|-------|-------------|---------------------|------|
| CNAME | canakkale   | cname.vercel-dns.com | 300  |
| CNAME | antalya     | cname.vercel-dns.com | 300  |

For wildcard:

| Type  | Name | Target              | TTL  |
|-------|------|---------------------|------|
| CNAME | *    | cname.vercel-dns.com | 300  |

### 3. Set environment variables

In Vercel → **Settings → Environment Variables**, set:

| Variable | Value | Required |
|----------|-------|----------|
| `CITY_NETWORK_ENABLED` | `true` | Yes — activates city tenant routing |
| `POSTGRES_READS_ENABLED` | `false` | Optional — enables Postgres read path for city news |
| `DATABASE_URL` | Neon pooled connection string | Optional (hardcoded Çanakkale + Antalya fallback exists) |
| `R2_ACCOUNT_ID` | Cloudflare account ID | For media uploads (Phase 2+) |
| `R2_ACCESS_KEY_ID` | R2 API token key | For media uploads (Phase 2+) |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | For media uploads (Phase 2+) |
| `R2_BUCKET_NAME` | `nahaber-media` | For media uploads (Phase 2+) |
| `R2_PUBLIC_URL` | Public bucket URL | For media uploads (Phase 2+) |

> Set `CITY_NETWORK_ENABLED` to `false` (or omit) to keep production on the national site only.
> The flag gates both middleware tenant resolution and the (city) route layout.

### 4. Deploy & verify

Deploy normally. After deploy with `CITY_NETWORK_ENABLED=true`:

1. Visit `canakkale.nahaber.com/` — should show Çanakkale city feed
2. Visit `antalya.nahaber.com/` — should show Antalya city feed
3. Visit `canakkale.nahaber.com/feed` — should show same city feed (NOT national)
4. Visit `antalya.nahaber.com/?debugmw=1` — should show tenant info JSON (`slug: antalya`)
5. Visit `nahaber.com/` — should still show national site unchanged

---

## Adding a new city

1. Add the city to `HARDCODED_TENANTS` in `src/lib/tenant.ts` (required for Edge middleware).
2. Seed the city in Postgres (`city_sites` table with `is_active = true`) via `src/db/seed.ts`.
3. Register brand assets in `src/lib/cityBrand.ts` under `public/brand/cities/<slug>/`.
4. Add the domain in Vercel (or use wildcard).
5. Add a DNS CNAME record.

Hardcoded fallbacks currently cover `canakkale` and `antalya`. Other cities need
`DATABASE_URL` + an active `city_sites` row **and** a `HARDCODED_TENANTS` entry
(middleware cannot use DB on Edge).

---

## Feature flags

| Flag                   | Default | Effect                                         |
|------------------------|---------|-------------------------------------------------|
| `CITY_NETWORK_ENABLED` | `false` | Gates all city tenant routing + UI              |
| `POSTGRES_READS_ENABLED`| `false`| When true, city news reads from Postgres first  |

Both flags default to `false`. Production nahaber.com is completely unchanged
until you flip `CITY_NETWORK_ENABLED=true` in environment variables.

---

## Data flow

City news feeds use a **dual-path** strategy:

1. **Firebase path** (default): queries existing `news` collection filtered by
   `citySlug === '<province_slug>'`. No new collections needed.
2. **Postgres path** (when `POSTGRES_READS_ENABLED=true`): reads from the `news`
   table's `city_slug` column. Falls back to Firebase on empty results or error.

```
cityNewsService.server.ts
  └→ isPostgresReadsEnabled() ?
       → Drizzle query: news WHERE status='published' AND city_slug='canakkale'
       → fallback to Firebase if empty
     : → Firebase: news.where('citySlug', '==', 'canakkale')
```

---

## Storage (Phase 2)

Media storage uses an abstraction layer at `src/lib/storage/`:

| Backend  | Role | Notes |
|----------|------|-------|
| R2       | Primary (new uploads) | Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY |
| Firebase | Read-only fallback    | Existing media URLs pass through unchanged |

```ts
import { getStorage, getMediaUrl } from '@/lib/storage'

// New uploads go to R2
const storage = getStorage()
await storage.upload('news/cover/abc.webp', buffer, { contentType: 'image/webp' })

// Resolve any URL — handles Firebase legacy, R2 keys, and external CDNs
const url = getMediaUrl(item.coverImageUrl)
```

No existing Firebase Storage files are deleted or migrated automatically.

---

## Safety checklist

- [x] `CITY_NETWORK_ENABLED` defaults to `false`
- [x] National hosts (nahaber.com, www, localhost) always serve national site
- [x] No Firebase data deletion or mutation
- [x] City (tenant) route group redirects to `/` when no tenant active
- [x] Existing middleware logic (country, language, admin guard) preserved
- [x] Existing design tokens reused (no new theme)
