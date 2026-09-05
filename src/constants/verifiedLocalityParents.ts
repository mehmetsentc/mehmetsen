/**
 * Verified locality / belde → parent district mappings.
 *
 * Keys are compound: `${provinceSlug}:${localitySlug}`.
 * NEVER resolve locality by name alone (Çardak collision: Çanakkale vs Denizli).
 *
 * Minimal high-value registry — not a full Turkey village database.
 * Verified from administrative parentage (ilçe), not AI / geocoding.
 */
export type VerifiedLocalityParent = {
  readonly provinceSlug: string
  readonly districtSlug: string
  readonly localitySlug: string
  readonly localityDisplayName: string
  readonly geoId: `TR:${string}:${string}`
  readonly source: 'verified_admin_parent'
  readonly notes?: string
}

/**
 * Lookup key = `${provinceSlug}:${localitySlug}` (both already normalizeGeoSlug'd).
 */
export const VERIFIED_LOCALITY_PARENTS: Readonly<Record<string, VerifiedLocalityParent>> = {
  'antalya:side': {
    provinceSlug: 'antalya',
    districtSlug: 'manavgat',
    localitySlug: 'side',
    localityDisplayName: 'Side',
    geoId: 'TR:antalya:manavgat',
    source: 'verified_admin_parent',
    notes: 'Side belde/mahalle under Manavgat district',
  },
  'canakkale:kucukkuyu': {
    provinceSlug: 'canakkale',
    districtSlug: 'ayvacik',
    localitySlug: 'kucukkuyu',
    localityDisplayName: 'Küçükkuyu',
    geoId: 'TR:canakkale:ayvacik',
    source: 'verified_admin_parent',
  },
  'canakkale:geyikli': {
    provinceSlug: 'canakkale',
    districtSlug: 'ezine',
    localitySlug: 'geyikli',
    localityDisplayName: 'Geyikli',
    geoId: 'TR:canakkale:ezine',
    source: 'verified_admin_parent',
  },
  'canakkale:evrese': {
    provinceSlug: 'canakkale',
    districtSlug: 'gelibolu',
    localitySlug: 'evrese',
    localityDisplayName: 'Evreşe',
    geoId: 'TR:canakkale:gelibolu',
    source: 'verified_admin_parent',
  },
  'canakkale:terzialan': {
    provinceSlug: 'canakkale',
    districtSlug: 'can',
    localitySlug: 'terzialan',
    localityDisplayName: 'Terzialan',
    geoId: 'TR:canakkale:can',
    source: 'verified_admin_parent',
  },
  /** Çanakkale belde — must NEVER resolve to Denizli/Çardak district. */
  'canakkale:cardak': {
    provinceSlug: 'canakkale',
    districtSlug: 'lapseki',
    localitySlug: 'cardak',
    localityDisplayName: 'Çardak',
    geoId: 'TR:canakkale:lapseki',
    source: 'verified_admin_parent',
    notes: 'Lapseki belde; distinct from Denizli district Çardak',
  },
  'canakkale:karabiga': {
    provinceSlug: 'canakkale',
    districtSlug: 'biga',
    localitySlug: 'karabiga',
    localityDisplayName: 'Karabiga',
    geoId: 'TR:canakkale:biga',
    source: 'verified_admin_parent',
  },
  'canakkale:gumuscay': {
    provinceSlug: 'canakkale',
    districtSlug: 'biga',
    localitySlug: 'gumuscay',
    localityDisplayName: 'Gümüşçay',
    geoId: 'TR:canakkale:biga',
    source: 'verified_admin_parent',
  },
} as const

export function localityParentKey(provinceSlug: string, localitySlug: string): string {
  return `${provinceSlug}:${localitySlug}`
}

export function lookupVerifiedLocalityParent(
  provinceSlug: string | null | undefined,
  localitySlug: string | null | undefined
): VerifiedLocalityParent | null {
  if (!provinceSlug || !localitySlug) return null
  return VERIFIED_LOCALITY_PARENTS[localityParentKey(provinceSlug, localitySlug)] ?? null
}
