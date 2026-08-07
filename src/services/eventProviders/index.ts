import type { EventProvider } from './types'
import { biletixProvider } from './biletix'
import { biletinoProvider } from './biletino'
import { bubiletProvider } from './bubilet'
import { genericProvider } from './genericProvider'
import { ticketmasterProvider } from './ticketmaster'

export type { EventProvider, EventProviderParams } from './types'

/**
 * Registered ticket-platform adapters.
 *
 * OFFICIAL API (requires API key — preferred when available):
 *   - ticketmaster — Ticketmaster Discovery API v2. Biletix = Ticketmaster TR,
 *                    so this is the same data via a proper, IP-unrestricted API.
 *                    Enable by setting TICKETMASTER_API_KEY in Vercel env vars.
 *                    Free tier: 5000 req/day. Sign up: developer.ticketmaster.com
 *
 * LIVE (scraped, enabled by default — no credentials needed):
 *   - biletix  — public Solr JSON endpoint. NOTE: Biletix/Ticketmaster blocks
 *                server-side requests from Vercel IPs. Use ticketmaster instead.
 *   - bubilet  — server-rendered HTML + per-event schema.org JSON-LD
 *                (dates, venue, geo coordinates, image, ticket URL).
 *
 * BEST-EFFORT / opt-in:
 *   - biletino — behind Cloudflare (HTTP 403 for plain requests). Disabled by
 *                default; enable with `BILETINO_ENABLED=true` + a reachable
 *                `BILETINO_BASE_URL` (e.g. a proxy/partner endpoint).
 *   - generic  — point `EVENTS_GENERIC_API_URL` at any JSON events endpoint
 *                (e.g. an in-house API or a Mobilet/Passo partner API).
 *
 * SKIPPED (documented, not implemented) — would require a headless browser,
 * which is intentionally out of scope:
 *   - Bugece, Mobilet, Passo — fully client-rendered SPAs / app-only APIs with
 *     no server-fetchable event JSON. Add an adapter here if/when a stable
 *     endpoint becomes available (the `generic` adapter can front a partner API
 *     for these without new code).
 */
export const eventProviders: EventProvider[] = [
  ticketmasterProvider, // preferred: official API, same data as Biletix
  biletixProvider,
  bubiletProvider,
  biletinoProvider,
  genericProvider,
]

/** Providers that are currently configured/enabled (their gates pass). */
export function getEnabledProviders(): EventProvider[] {
  return eventProviders.filter((p) => p.isEnabled())
}
