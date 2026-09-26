/**
 * SEO-1D.1 — Çanakkale crawl-discovery experiment (Phase 1: links only).
 *
 * Google has not crawled the city subdomains: there is no HTML path from the
 * indexed www host to them. This module is the single source of truth for the
 * small set of visible, crawlable links that bridge www → canakkale.nahaber.com.
 *
 * Experiment design (do not widen without SEO review):
 * - Test host: canakkale.nahaber.com — home, /ilceler, Biga, Gelibolu, Bozcaada.
 * - Control host: antalya.nahaber.com — must stay UNTREATED. Every helper here
 *   returns nothing for any city other than Çanakkale.
 * - District links rely only on the structured `citySlug` + `districtSlug`
 *   fields of an article; never on body-text keyword matching.
 */

export const DISCOVERY_EXPERIMENT_CITY_SLUG = 'canakkale'
export const DISCOVERY_EXPERIMENT_CITY_NAME = 'Çanakkale'
export const DISCOVERY_EXPERIMENT_CITY_ORIGIN = 'https://canakkale.nahaber.com'

/** Test districts with substantial live inventories (Biga 54, Gelibolu 48, Bozcaada 47 stories). */
export const DISCOVERY_EXPERIMENT_DISTRICTS: Readonly<Record<string, string>> = {
  biga: 'Biga',
  gelibolu: 'Gelibolu',
  bozcaada: 'Bozcaada',
}

export interface DiscoveryLink {
  href: string
  label: string
}

function normalizeSlug(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function isExperimentCity(citySlug: string | null | undefined): boolean {
  return normalizeSlug(citySlug) === DISCOVERY_EXPERIMENT_CITY_SLUG
}

function districtHref(districtSlug: string): string {
  return `${DISCOVERY_EXPERIMENT_CITY_ORIGIN}/ilceler/${districtSlug}`
}

/** Entry link from a www article of the experiment city to the city homepage. */
export function getCityHostDiscoveryLink(
  citySlug: string | null | undefined
): DiscoveryLink | null {
  if (!isExperimentCity(citySlug)) return null
  return {
    href: `${DISCOVERY_EXPERIMENT_CITY_ORIGIN}/`,
    label: `${DISCOVERY_EXPERIMENT_CITY_NAME} Haberleri`,
  }
}

/**
 * Contextual district link for a www article, based only on structured
 * `citySlug` + `districtSlug`. Returns null for any other city or district.
 */
export function getDistrictDiscoveryLink(
  citySlug: string | null | undefined,
  districtSlug: string | null | undefined
): DiscoveryLink | null {
  if (!isExperimentCity(citySlug)) return null
  const slug = normalizeSlug(districtSlug)
  const name = DISCOVERY_EXPERIMENT_DISTRICTS[slug]
  if (!name) return null
  return { href: districtHref(slug), label: `${name} Haberleri` }
}

/** Navigation bridge for www /yerel/{citySlug}: city home, /ilceler and the test districts. */
export function getYerelCityBridgeLinks(citySlug: string | null | undefined): DiscoveryLink[] {
  if (!isExperimentCity(citySlug)) return []
  return [
    { href: `${DISCOVERY_EXPERIMENT_CITY_ORIGIN}/`, label: `${DISCOVERY_EXPERIMENT_CITY_NAME} Haberleri` },
    { href: `${DISCOVERY_EXPERIMENT_CITY_ORIGIN}/ilceler`, label: 'İlçeler' },
    ...Object.entries(DISCOVERY_EXPERIMENT_DISTRICTS).map(([slug, name]) => ({
      href: districtHref(slug),
      label: name,
    })),
  ]
}
