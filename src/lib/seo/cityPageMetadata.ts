import type { Metadata } from 'next'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'
import { getSiteUrl } from '@/lib/seo'

/**
 * SEO-1B — self-canonical metadata for city subdomain landing pages.
 *
 * City hubs (`/ilceler`, `/ilceler/[slug]`, `/kategori/[id]`,
 * `/nobetci-eczaneler[/district]`, `/is-ilanlari`, `/etkinlik`) previously
 * returned only `{ title, description }` and inherited the root layout's
 * `alternates.canonical = https://www.nahaber.com` (plus og:url, twitter and a
 * `tr-TR → www` hreflang). Next.js does not deep-merge nested metadata objects,
 * so this helper always emits complete `alternates`, `openGraph` and `twitter`
 * objects.
 *
 * Canonical = `https://{citySlug}.nahaber.com/{segments...}`. Segments come from
 * the route definition / validated slugs — never from the raw request URL — and
 * must be lowercase kebab-case, so query strings, trailing slashes, uppercase
 * variants and arbitrary input cannot leak into the canonical.
 *
 * Returns `null` when the city slug or any segment is not safe; callers then keep
 * their previous metadata (no self-canonical for unknown input).
 *
 * Articles are NOT handled here: `/haber/[slug]` keeps the www canonical.
 */

const SAFE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `https://{city}.nahaber.com` for one of the 81 province slugs, else null. */
export function cityOriginForSlug(citySlug: string | null | undefined): string | null {
  if (!citySlug || !SAFE_SEGMENT.test(citySlug)) return null
  // Only exact province slugs — no fuzzy/legacy aliases as canonical hosts.
  if (normalizeCitySlug(citySlug) !== citySlug || !isTurkishProvinceSlug(citySlug)) return null
  return `https://${citySlug}.nahaber.com`
}

/** Canonical URL for a city landing page, or null when any part is unsafe. */
export function buildCityCanonicalUrl(
  citySlug: string | null | undefined,
  segments: readonly string[]
): string | null {
  const origin = cityOriginForSlug(citySlug)
  if (!origin) return null
  if (segments.length === 0) return origin
  if (!segments.every((s) => SAFE_SEGMENT.test(s))) return null
  return `${origin}/${segments.join('/')}`
}

export interface CityPageMetadataInput {
  citySlug: string | null | undefined
  /** Path segments from the route definition, e.g. ['ilceler', 'biga']. */
  segments: readonly string[]
  title: string
  description: string
}

export function buildCityPageMetadata(input: CityPageMetadataInput): Metadata | null {
  const canonical = buildCityCanonicalUrl(input.citySlug, input.segments)
  if (!canonical) return null

  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const mainOrigin = getSiteUrl()
  const ogImage = `${mainOrigin}/brand/og-default.png`
  const socialTitle = `${input.title} | ${siteName}`

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      // Intentionally no `languages`: the root layout's `tr-TR → www` hreflang is
      // wrong for city hubs. RSS alternates are kept (same as root layout).
      types: {
        'application/rss+xml': [
          { url: `${mainOrigin}/rss.xml`, title: `${siteName} RSS` },
          { url: `${mainOrigin}/breaking-news.xml`, title: `${siteName} Son Dakika` },
          { url: `${mainOrigin}/video-feed.xml`, title: `${siteName} Video` },
        ],
      },
    },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      siteName,
      url: canonical,
      title: socialTitle,
      description: input.description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      creator: '@nahabercom',
      title: socialTitle,
      description: input.description,
      images: [ogImage],
    },
  }
}
