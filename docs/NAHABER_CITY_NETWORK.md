# NaHaber City Network — Deployment & Setup Guide

## Overview

The City Network allows NaHaber to serve city-specific experiences on subdomains
(e.g. `canakkale.nahaber.com`) — same codebase, different content filtered by
province. Everything is gated behind the `CITY_NETWORK_ENABLED` feature flag.

## Architecture

```
canakkale.nahaber.com/
        ↓
   middleware.ts — detects subdomain → resolves CityTenant
        ↓
   Sets x-nahaber-tenant / x-nahaber-province headers + cookie
        ↓
   Rewrites / → /city-site (internal), /etkinlik → /city-site/etkinlik, etc.
        ↓
   city-site/ layout — reads tenant headers → renders CityLayoutClient
        ↓
   Firebase news collection filtered by citySlug === 'canakkale'
```

### Route structure (city tenant)

| Public URL      | Internal rewrite        | Page                        |
|-----------------|-------------------------|-----------------------------|
| `/`             | `/city-site`            | City main feed              |
| `/etkinlik`     | `/city-site/etkinlik`   | City events                 |
| `/spor`         | `/city-site/spor`       | City sports news            |
| `/ilceler`      | `/city-site/ilceler`    | District list               |
| `/haber/[slug]` | (no rewrite — shared)   | News article (shared route) |

Non-city paths (e.g. `/haber/[slug]`, `/search`) on city subdomains fall through
to the national site routes without rewrite.

### National routes (unchanged)

When `CITY_NETWORK_ENABLED=false` or host is `nahaber.com` / `www.nahaber.com` /
`localhost`, the app behaves exactly as before. No city tenant is resolved.

---

## Local Development

### Option 1: Subdomain via /etc/hosts (recommended)

Add to `/etc/hosts`:

```
127.0.0.1  canakkale.localhost
```

Then visit: `http://canakkale.localhost:3000`

> Most browsers resolve `*.localhost` without editing hosts. Try it first.

### Option 2: Query parameter fallback

Visit: `http://localhost:3000/?tenant=canakkale`

### Required environment variables

```env
CITY_NETWORK_ENABLED=true
# DATABASE_URL is optional — hardcoded fallback exists for canakkale
```

---

## Vercel Deployment

### 1. Add domain in Vercel

In your Vercel project dashboard → **Settings → Domains**, add:

- `canakkale.nahaber.com`

Or for wildcard (all future city subdomains):

- `*.nahaber.com`

### 2. DNS — CNAME record

At your DNS provider (e.g. Cloudflare, Google Domains), add:

| Type  | Name        | Target              | TTL  |
|-------|-------------|---------------------|------|
| CNAME | canakkale   | cname.vercel-dns.com | 300  |

For wildcard:

| Type  | Name | Target              | TTL  |
|-------|------|---------------------|------|
| CNAME | *    | cname.vercel-dns.com | 300  |

### 3. Set environment variables

In Vercel → **Settings → Environment Variables**, set:

```
CITY_NETWORK_ENABLED=true
```

> Set to `false` (or omit) to keep production on the national site only.
> The flag gates both middleware tenant resolution and the (city) route layout.

### 4. Deploy

Deploy normally. With `CITY_NETWORK_ENABLED=false`, the city subdomain will
redirect to the national homepage. Flip to `true` when ready.

---

## Adding a new city

1. Seed the city in Postgres (`city_sites` table with `is_active = true`).
2. Add the domain in Vercel (or use wildcard).
3. Add a DNS CNAME record.
4. The hardcoded tenant fallback in `src/lib/tenant.ts` only covers `canakkale`.
   For other cities, the `DATABASE_URL` must be set and the city must exist in
   the `city_sites` table.

---

## Feature flags

| Flag                   | Default | Effect                                         |
|------------------------|---------|-------------------------------------------------|
| `CITY_NETWORK_ENABLED` | `false` | Gates all city tenant routing + UI              |
| `POSTGRES_READS_ENABLED`| `false`| When true, read news from Postgres (Phase 7+)  |

Both flags default to `false`. Production nahaber.com is completely unchanged
until you flip `CITY_NETWORK_ENABLED=true` in environment variables.

---

## Data flow (Phase 6)

City news feeds read from the **existing Firebase `news` collection**, filtered
by `citySlug === '<province_slug>'`. No Postgres reads, no new collections.

The `citySlug` field is already populated on news documents by the newsroom
pipeline (geoEngine, localWorker). The city feed simply queries:

```
news.where('status', '==', 'published')
    .where('citySlug', '==', 'canakkale')
    .orderBy('publishedAt', 'desc')
    .limit(30)
```

When `POSTGRES_READS_ENABLED` is flipped in a future phase, the service layer
can swap to Drizzle/Neon queries without changing the UI.

---

## Safety checklist

- [x] `CITY_NETWORK_ENABLED` defaults to `false`
- [x] National hosts (nahaber.com, www, localhost) always serve national site
- [x] No Firebase data deletion or mutation
- [x] City (tenant) route group redirects to `/` when no tenant active
- [x] Existing middleware logic (country, language, admin guard) preserved
- [x] Existing design tokens reused (no new theme)
