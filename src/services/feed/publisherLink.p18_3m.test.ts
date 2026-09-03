import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'

describe('publisher profile slug gate', () => {
  it('accepts real profile slugs and rejects display labels', () => {
    expect(isPublisherProfileSlug('cumhuriyet')).toBe(true)
    expect(isPublisherProfileSlug('kanal-17-canakkale')).toBe(true)
    expect(isPublisherProfileSlug('Eskişehir.net')).toBe(false)
    expect(isPublisherProfileSlug('Çanakkale Olay')).toBe(false)
    expect(isPublisherProfileSlug('src_abc')).toBe(false)
    expect(isPublisherProfileSlug('source')).toBe(false)
    expect(isPublisherProfileSlug('')).toBe(false)
  })

  it('feed no longer maps display source names into linkable publisher.slug', () => {
    const candidate = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
      'utf8'
    )
    expect(candidate).toContain('publisherSlug: publishers.slug')
    expect(candidate).toContain('isPublisherProfileSlug(rawSlug)')
    expect(candidate).not.toMatch(/publisherSlug: sql[\s\S]*newsSources\.id/)

    const feed = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
    expect(feed).toContain('isPublisherProfileSlug')
    expect(feed).toContain('linkableSlug')

    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('isPublisherProfileSlug(item.publisher.slug)')
  })
})
