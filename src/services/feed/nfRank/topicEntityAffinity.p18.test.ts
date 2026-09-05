import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildSessionIntentFromEvents,
  normalizeCandidateTags,
} from '@/services/feed/nfRank/NFRankEngine'

describe('NFRank topic/entity affinity extension', () => {
  const agg = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedInterestAggregator.ts'),
    'utf8'
  )
  const feed = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const engine = readFileSync(
    join(process.cwd(), 'src/services/feed/nfRank/NFRankEngine.ts'),
    'utf8'
  )

  it('maps production past-tense social event names', () => {
    expect(agg).toContain("article_opened: 'ARTICLE_OPEN'")
    expect(agg).toContain("article_saved: 'SAVE'")
    expect(agg).toContain("publisher_followed: 'FOLLOW'")
  })

  it('writes namespaced cat/tag/ent interest keys with multi-tag share', () => {
    expect(agg).toContain("interestKey('tag'")
    expect(agg).toContain("interestKey('ent'")
    expect(agg).toContain('Math.sqrt(tags.length)')
  })

  it('wires sessionIntent into live ranking path', () => {
    expect(feed).toContain('loadSessionIntent')
    expect(feed).toContain('sessionIntent')
    expect(feed).toContain('buildSessionIntentFromEvents')
  })

  it('enriches telemetry with category + tags', () => {
    expect(client).toContain('tags: item.tags')
    expect(client).toContain('category: item.category')
  })

  it('SAD/ANGRY do not boost session affinity', () => {
    const sad = buildSessionIntentFromEvents([
      { eventType: 'SAD', category: 'magazin', tags: ['tarkan'], ageMinutes: 1 },
      { eventType: 'ANGRY', category: 'asayis', tags: ['narkotik'], ageMinutes: 1 },
    ])
    expect(sad.categoryBoosts.size).toBe(0)
    expect(sad.tagBoosts.size).toBe(0)
  })

  it('save beats passive open in session boost', () => {
    const open = buildSessionIntentFromEvents([
      { eventType: 'article_opened', category: 'magazin', tags: ['tarkan'], ageMinutes: 0 },
    ])
    const save = buildSessionIntentFromEvents([
      { eventType: 'article_saved', category: 'magazin', tags: ['tarkan'], ageMinutes: 0 },
    ])
    const openTag = open.tagBoosts.get(normalizeCandidateTags(['tarkan'])[0]!) ?? 0
    const saveTag = save.tagBoosts.get(normalizeCandidateTags(['tarkan'])[0]!) ?? 0
    expect(saveTag).toBeGreaterThan(openTag)
  })

  it('does not introduce Haversine / proximity', () => {
    expect(engine).not.toMatch(/\bhaversine\s*\(|LOCAL_NEARBY/i)
    expect(agg).not.toMatch(/\bhaversine\s*\(|LOCAL_NEARBY/i)
  })
})
