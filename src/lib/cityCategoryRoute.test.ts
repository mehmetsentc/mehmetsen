import { describe, expect, it } from 'vitest'
import { resolveCityCategoryRoute } from '@/lib/cityCategoryRoute'

describe('resolveCityCategoryRoute', () => {
  it('maps siyaset chip to siyaset family root', () => {
    expect(resolveCityCategoryRoute('siyaset')).toEqual({
      categoryId: 'siyaset',
      label: 'Siyaset',
    })
  })

  it('maps yerel-siyaset URL to national Siyaset label', () => {
    expect(resolveCityCategoryRoute('yerel-siyaset')).toEqual({
      categoryId: 'siyaset',
      label: 'Siyaset',
    })
  })

  it('keeps yerel-duyuru as-is', () => {
    expect(resolveCityCategoryRoute('yerel-duyuru')).toEqual({
      categoryId: 'yerel-duyuru',
      label: 'Duyuru',
    })
  })

  it('returns null for unknown id', () => {
    expect(resolveCityCategoryRoute('not-a-real-category')).toBeNull()
  })

  it('resolves every desktop newspaper nav slug', async () => {
    const { CITY_NEWSPAPER_NAV } = await import('@/lib/cityNewspaperNav')
    for (const item of CITY_NEWSPAPER_NAV) {
      if (item.href === '/') continue
      const slug = item.href.replace('/kategori/', '')
      expect(resolveCityCategoryRoute(slug), item.href).not.toBeNull()
    }
  })
})
