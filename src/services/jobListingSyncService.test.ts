import { describe, expect, it } from 'vitest'
import {
  flattenApifyDataset,
  normalizeApifyJobItem,
  resolveIskurSyncCities,
} from '@/services/jobListingSyncService'

describe('flattenApifyDataset', () => {
  it('unwraps ilanlar arrays from category wrappers', () => {
    const flat = flattenApifyDataset([
      {
        ilanTuru: 'Normal İş İlanları',
        toplamIlanSayisi: 1,
        ilanlar: [{ ilanNo: '1', meslek: 'Garson' }],
      },
      { ilanTuru: 'IUP', toplamIlanSayisi: 0, ilanlar: [] },
    ])
    expect(flat).toHaveLength(1)
    expect((flat[0] as { meslek: string }).meslek).toBe('Garson')
  })
})


describe('normalizeApifyJobItem', () => {
  it('maps common Turkish fields and builds detail URL', () => {
    const listing = normalizeApifyJobItem(
      {
        ilanNo: '00009289510',
        meslek: 'Satış Danışmanı',
        isveren: 'Örnek Ltd.',
        isverenTuru: 'Ozel',
        ilce: 'Merkez',
        calismaYeri: 'ÇANAKKALE/MERKEZ',
        sonBasvuruTarihi: '20.08.2026',
        calismaSekli: 'Tam Zamanlı',
        acikPozisyon: 2,
        ilanTuru: 'normal',
      },
      'canakkale',
      '2026-08-14T00:00:00.000Z'
    )

    expect(listing).not.toBeNull()
    expect(listing!.id).toBe('iskur_00009289510')
    expect(listing!.title).toBe('Satış Danışmanı')
    expect(listing!.employer).toBe('Örnek Ltd.')
    expect(listing!.district).toBe('Merkez')
    expect(listing!.openPositions).toBe(2)
    expect(listing!.listingKind).toBe('normal')
    expect(listing!.applyUrl).toContain('uiID=00009289510')
    expect(listing!.deadlineAt).toContain('2026-08-20')
    expect(listing!.source).toBe('iskur')
    expect(listing!.citySlug).toBe('canakkale')
  })

  it('returns null when title is missing', () => {
    expect(normalizeApifyJobItem({ ilanNo: '1' }, 'canakkale', '2026-08-14T00:00:00.000Z')).toBeNull()
  })
})

describe('resolveIskurSyncCities', () => {
  it('defaults to canakkale when env empty', () => {
    const prev = process.env.ISKUR_SYNC_CITIES
    delete process.env.ISKUR_SYNC_CITIES
    expect(resolveIskurSyncCities()).toEqual(['canakkale'])
    if (prev !== undefined) process.env.ISKUR_SYNC_CITIES = prev
  })

  it('narrows to a single city when filter is in allowlist', () => {
    const prev = process.env.ISKUR_SYNC_CITIES
    process.env.ISKUR_SYNC_CITIES = 'canakkale,antalya'
    expect(resolveIskurSyncCities('antalya')).toEqual(['antalya'])
    expect(resolveIskurSyncCities('istanbul')).toEqual([])
    if (prev !== undefined) process.env.ISKUR_SYNC_CITIES = prev
    else delete process.env.ISKUR_SYNC_CITIES
  })
})
