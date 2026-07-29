/**
 * Location-aware search query builder for local news discovery.
 * Does not hardcode a single city — callers pass province/district/topic.
 */

export interface LocalQueryInput {
  province: string
  district?: string
  town?: string
  topic?: string
  eventType?: string
}

export interface LocalQueryBundle {
  queries: string[]
  institutions: string[]
}

const EVENT_ALIASES: Record<string, string[]> = {
  wildfire: ['yangın', 'orman yangını'],
  earthquake: ['deprem', 'artçı'],
  flood: ['sel', 'su baskını'],
  traffic: ['trafik', 'kaza', 'yol'],
  ferry: ['feribot', 'deniz ulaşımı'],
  municipality: ['belediye', 'belediye meclisi'],
  weather: ['yağış', 'fırtına', 'kar'],
}

/**
 * Build discovery query variants for a local lead.
 */
export function buildLocalQueries(input: LocalQueryInput): LocalQueryBundle {
  const province = input.province.trim()
  const district = input.district?.trim()
  const town = input.town?.trim()
  const topic = (input.topic || input.eventType || '').trim()
  const aliases =
    (input.eventType && EVENT_ALIASES[input.eventType]) ||
    (topic ? [topic] : ['son dakika'])

  const placeChain = [town, district, province].filter(Boolean) as string[]
  const primaryPlace = district || town || province

  const queries: string[] = []
  for (const alias of aliases) {
    queries.push(`${primaryPlace} ${alias}`)
    if (district && province) queries.push(`${province} ${district} ${alias}`)
    if (district) queries.push(`${district} Belediyesi ${alias}`)
    queries.push(`${province} Valiliği ${district || ''} ${alias}`.replace(/\s+/g, ' ').trim())
    queries.push(`${primaryPlace} son dakika`)
  }

  const institutions = [
    `${province} Valiliği`,
    district ? `${district} Belediyesi` : `${province} Belediyesi`,
    district ? `${district} Kaymakamlığı` : null,
    'AFAD',
    'Meteoroloji',
    `${province} İl Emniyet Müdürlüğü`,
    `${province} İl Jandarma Komutanlığı`,
  ].filter(Boolean) as string[]

  return {
    queries: [...new Set(queries)].slice(0, 16),
    institutions,
  }
}

/** Çanakkale desk helper — uses structured districts, not prompt memory. */
export const CANAKKALE_LOCAL_PROFILE = {
  province: 'Çanakkale',
  provinceSlug: 'canakkale',
  priority: 'very_high' as const,
  districts: [
    'Merkez',
    'Biga',
    'Çan',
    'Yenice',
    'Bayramiç',
    'Ezine',
    'Ayvacık',
    'Lapseki',
    'Gelibolu',
    'Eceabat',
    'Gökçeada',
    'Bozcaada',
  ],
}

export function buildCanakkaleQueries(district?: string, topic?: string): LocalQueryBundle {
  return buildLocalQueries({
    province: 'Çanakkale',
    district,
    topic,
    eventType: topic?.includes('yangın') ? 'wildfire' : undefined,
  })
}
