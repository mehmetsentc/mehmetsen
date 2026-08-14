import { describe, expect, it } from 'vitest'
import {
  buildKariyerListingUrl,
  flattenKariyerDataset,
  normalizeKariyerJobItem,
} from '@/services/kariyerJobListingSyncService'

describe('buildKariyerListingUrl', () => {
  it('builds city listing URL', () => {
    expect(buildKariyerListingUrl('canakkale')).toBe(
      'https://www.kariyer.net/is-ilanlari/canakkale'
    )
  })
})

describe('flattenKariyerDataset', () => {
  it('unwraps outputrecord wrappers', () => {
    const flat = flattenKariyerDataset([
      {
        outputrecord: {
          id: '1',
          title: 'Garson',
          url: 'https://www.kariyer.net/is-ilani/x-1',
        },
      },
    ])
    expect(flat).toHaveLength(1)
    expect(flat[0].title).toBe('Garson')
  })
})

describe('normalizeKariyerJobItem', () => {
  it('maps actor card fields', () => {
    const listing = normalizeKariyerJobItem(
      {
        id: '4275364',
        url: 'https://www.kariyer.net/is-ilani/ornek-4275364',
        title: 'Yazılım Uzmanı',
        company: 'Örnek A.Ş.',
        location: 'Çanakkale',
        workModel: 'İş Yerinde',
        employmentType: 'Tam zamanlı',
      },
      'canakkale',
      '2026-08-14T00:00:00.000Z'
    )

    expect(listing).not.toBeNull()
    expect(listing!.id).toBe('kariyer_4275364')
    expect(listing!.source).toBe('kariyer')
    expect(listing!.title).toBe('Yazılım Uzmanı')
    expect(listing!.employer).toBe('Örnek A.Ş.')
    expect(listing!.applyUrl).toContain('4275364')
    expect(listing!.workType).toContain('Tam zamanlı')
  })

  it('returns null without title', () => {
    expect(
      normalizeKariyerJobItem({ id: '1' }, 'canakkale', '2026-08-14T00:00:00.000Z')
    ).toBeNull()
  })
})
