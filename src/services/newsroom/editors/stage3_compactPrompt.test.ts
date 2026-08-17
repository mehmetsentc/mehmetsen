import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STAGE3_COMPACT_SYSTEM,
  buildCompactStage3UserPrompt,
  getStage3CompactPromptPercent,
  isStage3CompactPromptEnabled,
  shouldUseStage3CompactPrompt,
  stage3CanaryBucket,
} from '@/services/newsroom/editors/stage3_compactPrompt'

describe('Stage3 compact prompt candidate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled by default', () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT', '')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', '')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '')
    expect(isStage3CompactPromptEnabled()).toBe(false)
    expect(getStage3CompactPromptPercent()).toBe(0)
    expect(shouldUseStage3CompactPrompt('news-1')).toBe(false)
  })

  it('is much smaller than a 6000-char article dump', () => {
    const article = 'x'.repeat(6000)
    const compact = buildCompactStage3UserPrompt({
      title: 'Başlık',
      spot: 'Spot metin',
      content: article,
      sourceLabel: 'AA',
      currentCategory: 'gundem',
      city: 'Çanakkale',
      country: 'Türkiye',
      tags: ['feribot'],
      categoryIds: ['gundem', 'yerel-haber', 'siyaset'],
      maxArticleChars: 1200,
    })
    expect(compact.length).toBeLessThan(2500)
    expect(compact).toContain('Başlık')
    expect(compact).toContain('Çanakkale')
    expect(compact).toContain('feribot')
    expect(compact).not.toContain('x'.repeat(1201))
    expect(STAGE3_COMPACT_SYSTEM.length).toBeLessThan(800)
  })
})
