/**
 * Deterministic weighted province batching for occurrence cron.
 * Weights come from V2.6 measured planned-occurrence inventory, not ML.
 */
import { TURKISH_PROVINCES } from '@/constants/cities'
import type { OccurrenceCheckpoint } from '@/lib/eventSyncCheckpoint'

/** V2.6 per-city planned occurrence counts (insert+update+skip). Floor 1. */
export const PROVINCE_INVENTORY_WEIGHTS: Readonly<Record<string, number>> = {
  adana: 81,
  adiyaman: 9,
  afyonkarahisar: 14,
  agri: 1,
  aksaray: 17,
  amasya: 17,
  ankara: 292,
  antalya: 140,
  ardahan: 1,
  artvin: 5,
  aydin: 28,
  balikesir: 36,
  bartin: 12,
  batman: 13,
  bayburt: 1,
  bilecik: 1,
  bingol: 3,
  bitlis: 1,
  bolu: 24,
  burdur: 11,
  bursa: 118,
  canakkale: 19,
  cankiri: 1,
  corum: 13,
  denizli: 56,
  diyarbakir: 37,
  duzce: 9,
  edirne: 18,
  elazig: 13,
  erzincan: 11,
  erzurum: 15,
  eskisehir: 73,
  gaziantep: 71,
  giresun: 3,
  gumushane: 2,
  hakkari: 1,
  hatay: 26,
  igdir: 2,
  isparta: 23,
  istanbul: 290,
  izmir: 228,
  kahramanmaras: 8,
  karabuk: 13,
  karaman: 11,
  kars: 14,
  kastamonu: 11,
  kayseri: 36,
  kilis: 11,
  kirikkale: 1,
  kirklareli: 9,
  kirsehir: 10,
  kocaeli: 72,
  konya: 46,
  kutahya: 15,
  malatya: 20,
  manisa: 23,
  mardin: 15,
  mersin: 83,
  mugla: 50,
  mus: 3,
  nevsehir: 16,
  nigde: 12,
  ordu: 25,
  osmaniye: 8,
  rize: 9,
  sakarya: 51,
  samsun: 45,
  sanliurfa: 21,
  siirt: 3,
  sinop: 15,
  sirnak: 6,
  sivas: 20,
  tekirdag: 35,
  tokat: 12,
  trabzon: 22,
  tunceli: 2,
  usak: 14,
  van: 12,
  yalova: 6,
  yozgat: 11,
  zonguldak: 14,
}

export const BILETIX_TARGET_BATCHES = 3
export const BUBILET_CITIES_PER_BATCH = 27
export const BILETIMGO_EQUIVALENCE_CITIES = ['istanbul', 'ankara', 'izmir'] as const

export type OccurrenceWorkProvider = 'biletix' | 'bubilet' | 'biletimgo'

export interface OccurrenceWorkUnit {
  provider: OccurrenceWorkProvider
  cities: string[]
  batchIndex: number
  weight: number
}

export function provinceWeight(slug: string): number {
  return Math.max(1, PROVINCE_INVENTORY_WEIGHTS[slug] ?? 1)
}

export function packWeightedBatches(
  slugs: string[],
  options: { targetBatches?: number; weights?: Readonly<Record<string, number>> } = {}
): string[][] {
  const target = Math.max(1, options.targetBatches ?? BILETIX_TARGET_BATCHES)
  if (slugs.length === 0) return []
  const weightOf = (slug: string) => Math.max(1, options.weights?.[slug] ?? provinceWeight(slug))
  const total = slugs.reduce((sum, slug) => sum + weightOf(slug), 0)
  const heaviest = Math.max(...slugs.map(weightOf))
  const capacity = Math.max(heaviest, Math.ceil(total / target))

  const ordered = [...slugs].sort((a, b) => {
    const diff = weightOf(b) - weightOf(a)
    return diff !== 0 ? diff : a.localeCompare(b)
  })

  const batches: Array<{ slugs: string[]; weight: number }> = []
  for (const slug of ordered) {
    const w = weightOf(slug)
    let placed = false
    for (const batch of batches) {
      if (batch.weight + w <= capacity) {
        batch.slugs.push(slug)
        batch.weight += w
        placed = true
        break
      }
    }
    if (!placed) {
      if (batches.length < target) {
        batches.push({ slugs: [slug], weight: w })
      } else {
        const lightest = batches.reduce((min, batch) => (batch.weight < min.weight ? batch : min))
        lightest.slugs.push(slug)
        lightest.weight += w
      }
    }
  }
  return batches.map((batch) => batch.slugs)
}

export function chunkFixed(slugs: string[], size: number): string[][] {
  if (size <= 0) return [slugs]
  const out: string[][] = []
  for (let i = 0; i < slugs.length; i += size) {
    out.push(slugs.slice(i, i + size))
  }
  return out
}

export function planProviderBatches(input: {
  slugs: string[]
  rotatedBubilet: string[]
}): Record<OccurrenceWorkProvider, string[][]> {
  return {
    biletix: packWeightedBatches(input.slugs),
    bubilet: chunkFixed(input.rotatedBubilet, BUBILET_CITIES_PER_BATCH),
    biletimgo: [[...BILETIMGO_EQUIVALENCE_CITIES]],
  }
}

export function nextWorkUnit(
  checkpoint: OccurrenceCheckpoint,
  batches: Record<OccurrenceWorkProvider, string[][]>
): OccurrenceWorkUnit | null {
  if (!checkpoint.biletix.completed) {
    const batch = batches.biletix[checkpoint.biletix.nextIndex]
    if (!batch) {
      return null
    }
    return {
      provider: 'biletix',
      cities: batch,
      batchIndex: checkpoint.biletix.nextIndex,
      weight: batch.reduce((sum, slug) => sum + provinceWeight(slug), 0),
    }
  }
  if (!checkpoint.bubilet.completed) {
    const batch = batches.bubilet[checkpoint.bubilet.nextIndex]
    if (!batch) return null
    return {
      provider: 'bubilet',
      cities: batch,
      batchIndex: checkpoint.bubilet.nextIndex,
      weight: batch.length,
    }
  }
  if (!checkpoint.biletimgo.completed) {
    const batch = batches.biletimgo[0] ?? []
    return {
      provider: 'biletimgo',
      cities: batch,
      batchIndex: 0,
      weight: batch.length,
    }
  }
  return null
}

export function nationalProvinceSlugs(): string[] {
  return TURKISH_PROVINCES.map((province) => province.slug)
}

export function unionProviderIds(batches: string[][]): string[] {
  return [...new Set(batches.flat())].sort()
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const concurrency = Math.max(1, Math.min(limit, items.length || 1))
  const results: R[] = new Array(items.length)
  let next = 0
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()))
  return results
}
