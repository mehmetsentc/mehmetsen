import { describe, expect, it } from 'vitest'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { newOccurrenceCycle, advanceProviderCursor } from '@/lib/eventSyncCheckpoint'
import {
  BILETIMGO_EQUIVALENCE_CITIES,
  PROVINCE_INVENTORY_WEIGHTS,
  chunkFixed,
  mapLimit,
  nationalProvinceSlugs,
  nextWorkUnit,
  packWeightedBatches,
  planProviderBatches,
  provinceWeight,
  unionProviderIds,
} from './occurrenceBatchPlanner'

describe('weighted occurrence batch planner', () => {
  it('weights Istanbul/Ankara/Izmir far above Ardahan/Bayburt', () => {
    expect(provinceWeight('istanbul')).toBeGreaterThan(provinceWeight('ardahan') * 50)
    expect(provinceWeight('ankara')).toBeGreaterThan(provinceWeight('bayburt') * 50)
    expect(provinceWeight('izmir')).toBeGreaterThan(provinceWeight('tunceli') * 20)
    expect(Object.keys(PROVINCE_INVENTORY_WEIGHTS)).toHaveLength(81)
  })

  it('packs every province exactly once across weighted Biletix batches', () => {
    const slugs = nationalProvinceSlugs()
    const batches = packWeightedBatches(slugs)
    expect(batches.length).toBeGreaterThanOrEqual(3)
    expect(unionProviderIds(batches)).toEqual([...slugs].sort())
    expect(batches.flat()).toHaveLength(81)
    const istanbulBatch = batches.find((batch) => batch.includes('istanbul'))
    const ardahanBatch = batches.find((batch) => batch.includes('ardahan'))
    expect(istanbulBatch).toBeTruthy()
    expect(ardahanBatch).toBeTruthy()
    const istanbulWeight = istanbulBatch!.reduce((sum, slug) => sum + provinceWeight(slug), 0)
    const ardahanWeight = ardahanBatch!.reduce((sum, slug) => sum + provinceWeight(slug), 0)
    expect(istanbulWeight).toBeGreaterThan(ardahanWeight * 0.5)
  })

  it('does not put every metro in a single undersized bin', () => {
    const batches = packWeightedBatches(['istanbul', 'ankara', 'izmir', 'ardahan', 'bayburt'], {
      targetBatches: 3,
    })
    expect(batches.flat().sort()).toEqual(['ankara', 'ardahan', 'bayburt', 'istanbul', 'izmir'])
  })

  it('chunks Bubilet cities without dropping any', () => {
    const slugs = TURKISH_PROVINCES.map((p) => p.slug)
    const chunks = chunkFixed(slugs, 27)
    expect(chunks).toHaveLength(3)
    expect(chunks.flat()).toEqual(slugs)
  })

  it('advances providers independently from the same checkpoint', () => {
    const slugs = ['istanbul', 'ankara', 'izmir', 'samsun']
    const batches = planProviderBatches({ slugs, rotatedBubilet: slugs })
    let checkpoint = newOccurrenceCycle('2026-09-21T21:00:00.000Z')
    const first = nextWorkUnit(checkpoint, batches)
    expect(first?.provider).toBe('biletix')
    checkpoint = {
      ...checkpoint,
      biletix: advanceProviderCursor(checkpoint.biletix, {
        nextIndex: batches.biletix.length,
        completed: true,
      }),
    }
    const second = nextWorkUnit(checkpoint, batches)
    expect(second?.provider).toBe('bubilet')
    checkpoint = {
      ...checkpoint,
      bubilet: advanceProviderCursor(checkpoint.bubilet, {
        nextIndex: batches.bubilet.length,
        completed: true,
      }),
    }
    const third = nextWorkUnit(checkpoint, batches)
    expect(third?.provider).toBe('biletimgo')
    expect(third?.cities).toEqual([...BILETIMGO_EQUIVALENCE_CITIES])
    expect(BILETIMGO_EQUIVALENCE_CITIES).toEqual(['istanbul', 'ankara', 'izmir'])
  })

  it('overlapping batch ID unions never duplicate', () => {
    const a = ['biletix:1', 'biletix:2']
    const b = ['biletix:2', 'biletix:3']
    expect(unionProviderIds([a, b])).toEqual(['biletix:1', 'biletix:2', 'biletix:3'])
  })

  it('mapLimit preserves order and respects concurrency', async () => {
    const seen: number[] = []
    const out = await mapLimit([1, 2, 3, 4], 2, async (n) => {
      seen.push(n)
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40])
    expect(seen.sort()).toEqual([1, 2, 3, 4])
  })
})
