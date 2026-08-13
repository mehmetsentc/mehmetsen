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
})
