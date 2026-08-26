import { describe, expect, it } from 'vitest'
import { slugifyPublisherName, publisherSlugWithSuffix } from '@/lib/publisher/slug'

describe('publisher slug helpers', () => {
  it('turkish-normalizes names', () => {
    expect(slugifyPublisherName('Hürriyet Gazetesi')).toBe('hurriyet-gazetesi')
  })

  it('appends collision suffix', () => {
    expect(publisherSlugWithSuffix('hurriyet', 2)).toBe('hurriyet-2')
    expect(publisherSlugWithSuffix('hurriyet-2', 3)).toBe('hurriyet-3')
  })
})
