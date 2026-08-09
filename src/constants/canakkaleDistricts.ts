/** Geographic region tabs for Çanakkale ilçe selection. */
export type CanakkaleRegionId = 'all' | 'anadolu' | 'gelibolu' | 'adalar'

export const CANAKKALE_REGION_TABS: ReadonlyArray<{
  id: CanakkaleRegionId
  label: string
  description: string
}> = [
  { id: 'all', label: 'Tümü', description: '12 ilçe' },
  { id: 'anadolu', label: 'Anadolu Yakası', description: 'Ana kara' },
  { id: 'gelibolu', label: 'Gelibolu', description: 'Yarımada' },
  { id: 'adalar', label: 'Adalar', description: 'Bozcaada & Gökçeada' },
]

/** District slug → geographic region (excludes "all"). */
export const CANAKKALE_DISTRICT_REGIONS: Readonly<Record<string, CanakkaleRegionId>> = {
  ayvacik: 'anadolu',
  bayramic: 'anadolu',
  biga: 'anadolu',
  can: 'anadolu',
  ezine: 'anadolu',
  lapseki: 'anadolu',
  merkez: 'anadolu',
  yenice: 'anadolu',
  eceabat: 'gelibolu',
  gelibolu: 'gelibolu',
  bozcaada: 'adalar',
  gokceada: 'adalar',
}

export function getCanakkaleRegionForDistrict(slug: string): CanakkaleRegionId {
  return CANAKKALE_DISTRICT_REGIONS[slug] ?? 'anadolu'
}

export function districtMatchesCanakkaleRegion(
  slug: string,
  region: CanakkaleRegionId
): boolean {
  if (region === 'all') return true
  return getCanakkaleRegionForDistrict(slug) === region
}

/** Simplified SVG path + label anchor for the stylized Çanakkale map. */
export interface CanakkaleMapDistrict {
  slug: string
  d: string
  labelX: number
  labelY: number
  shortLabel?: string
}

export const CANAKKALE_MAP_DISTRICTS: readonly CanakkaleMapDistrict[] = [
  {
    slug: 'gelibolu',
    d: 'M28 48 L108 38 L118 92 L96 108 L38 98 Z',
    labelX: 72,
    labelY: 72,
    shortLabel: 'Gelibolu',
  },
  {
    slug: 'eceabat',
    d: 'M38 102 L96 110 L104 168 L52 162 L32 138 Z',
    labelX: 68,
    labelY: 138,
    shortLabel: 'Eceabat',
  },
  {
    slug: 'lapseki',
    d: 'M148 22 L228 16 L238 58 L162 64 Z',
    labelX: 192,
    labelY: 44,
    shortLabel: 'Lapseki',
  },
  {
    slug: 'biga',
    d: 'M162 68 L268 58 L282 118 L178 124 Z',
    labelX: 222,
    labelY: 92,
    shortLabel: 'Biga',
  },
  {
    slug: 'merkez',
    d: 'M142 128 L182 124 L188 178 L136 182 Z',
    labelX: 158,
    labelY: 154,
    shortLabel: 'Merkez',
  },
  {
    slug: 'can',
    d: 'M288 62 L372 52 L384 128 L296 132 Z',
    labelX: 336,
    labelY: 94,
    shortLabel: 'Çan',
  },
  {
    slug: 'bayramic',
    d: 'M292 136 L384 128 L392 188 L298 192 Z',
    labelX: 342,
    labelY: 162,
    shortLabel: 'Bayramiç',
  },
  {
    slug: 'ezine',
    d: 'M182 128 L288 136 L294 196 L176 200 Z',
    labelX: 234,
    labelY: 166,
    shortLabel: 'Ezine',
  },
  {
    slug: 'yenice',
    d: 'M296 196 L392 188 L400 248 L302 254 Z',
    labelX: 348,
    labelY: 222,
    shortLabel: 'Yenice',
  },
  {
    slug: 'ayvacik',
    d: 'M176 204 L298 210 L306 296 L168 288 Z',
    labelX: 236,
    labelY: 252,
    shortLabel: 'Ayvacık',
  },
  {
    slug: 'gokceada',
    d: 'M52 218 C52 200 118 196 122 218 C126 242 58 248 52 218 Z',
    labelX: 88,
    labelY: 224,
    shortLabel: 'Gökçeada',
  },
  {
    slug: 'bozcaada',
    d: 'M132 262 C132 248 178 244 182 262 C186 284 136 288 132 262 Z',
    labelX: 158,
    labelY: 268,
    shortLabel: 'Bozcaada',
  },
]
