import { describe, expect, it } from 'vitest'
import {
  getHeaderAllNavItems,
  getNewspaperNavItems,
  getSiteNavItems,
} from '@/constants/config'
import { ROUTES } from '@/constants/routes'

describe('desktop header nav', () => {
  it('starts with Ana Sayfa and includes Kıbrıs in global category order', () => {
    const header = getHeaderAllNavItems()
    const ids = header.map((item) => item.id)
    const labels = header.map((item) => item.label)

    expect(ids[0]).toBe('feed')
    expect(labels[0]).toBe('Ana Sayfa')
    expect(header[0]?.href).toBe(ROUTES.FEED)

    expect(ids[1]).toBe('son-dakika')
    expect(ids).toContain('kibris-haberleri')
    expect(labels[ids.indexOf('kibris-haberleri')]).toBe('Kıbrıs')

    const globalTopLevel = getSiteNavItems()
      .filter((item) => !item.indent)
      .map((item) => item.id)
    const headerWithoutExtras = ids.filter(
      (id) => id !== 'son-dakika' && id !== 'finans-piyasa' && id !== 'video'
    )
    expect(headerWithoutExtras).toEqual(globalTopLevel)

    expect(ids.indexOf('ekonomi')).toBeLessThan(ids.indexOf('finans-piyasa'))
    expect(ids.at(-1)).toBe('video')
    expect(header.every((item) => !item.indent)).toBe(true)
  })

  it('locks the approved 12-link newspaper masthead order', () => {
    const items = getNewspaperNavItems()
    expect(items.map((item) => item.id)).toEqual([
      'feed',
      'gundem',
      'yerel',
      'asayis',
      'dunya',
      'siyaset',
      'ekonomi',
      'spor',
      'teknoloji',
      'kultur',
      'saglik',
      'video',
    ])
    expect(items.find((item) => item.id === 'siyaset')?.label).toBe('Siyaset')
    expect(items.find((item) => item.id === 'kultur')?.label).toBe('Kültür')
    expect(items.at(-1)?.href).toBe(ROUTES.REELS)
  })
})
