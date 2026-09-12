import { describe, expect, it } from 'vitest'
import { NEWS_FORMAT_LOCK } from './newsFormatLock'
import { CURRENT_PRODUCTION_NEWS_FORMAT_LOCK } from './currentProductionNewsFormatLock'
import { SEED_AI_EDITORS } from './seedEditors'
import { SEED_CITY_AI_EDITORS } from './seedCityEditors'
import { composePreviewNewsPrompt, formatLockForArm } from './previewCompose'

describe('AI STYLE P1.3 — runtime DNA vs current production lock', () => {
  it('NEW lock adds presentation rules that CURRENT production lock does not have', () => {
    expect(NEWS_FORMAT_LOCK).toContain('NAHABER SUNUŞ (AI STYLE P1.3')
    expect(CURRENT_PRODUCTION_NEWS_FORMAT_LOCK).not.toContain('NAHABER SUNUŞ')
    expect(CURRENT_PRODUCTION_NEWS_FORMAT_LOCK).not.toContain('HIGH-ENGAGEMENT')
    expect(formatLockForArm('new')).toBe(NEWS_FORMAT_LOCK)
    expect(formatLockForArm('current')).toBe(CURRENT_PRODUCTION_NEWS_FORMAT_LOCK)
  })

  it('columnist cores still do not carry NEWS DNA', () => {
    const columnists = SEED_AI_EDITORS.filter((s) => s.personaType === 'columnist')
    expect(columnists.length).toBeGreaterThanOrEqual(6)
    for (const spec of columnists) {
      expect(spec.prompts.core).not.toContain('NAHABER SUNUŞ')
      expect(spec.prompts.core).not.toContain('NAHABER HIGH-ENGAGEMENT DNA')
    }
  })

  it('81 city editors still share one template and inherit GLOBAL rules', () => {
    expect(SEED_CITY_AI_EDITORS).toHaveLength(81)
    const canakkale = SEED_CITY_AI_EDITORS.find((s) => s.slug === 'yerel-canakkale')
    expect(canakkale).toBeTruthy()
    expect(canakkale!.citySlug).toBe('canakkale')
    expect(canakkale!.prompts.news).toContain('Çanakkale')
    expect(new Set(SEED_CITY_AI_EDITORS.map((s) => s.slug)).size).toBe(81)
  })

  it('preview compose uses seed text only — NEW arm includes P1.3, CURRENT does not', () => {
    const spec = SEED_AI_EDITORS.find((s) => s.slug === 'arda-sahin')!
    const current = composePreviewNewsPrompt({
      spec,
      arm: 'current',
      sourceTitle: 'Test başlık',
      sourceBody: 'Kaynak gövde',
      sourceUrl: 'https://example.com/haber',
      categoryId: 'son-dakika',
    })
    const neu = composePreviewNewsPrompt({
      spec,
      arm: 'new',
      sourceTitle: 'Test başlık',
      sourceBody: 'Kaynak gövde',
      sourceUrl: 'https://example.com/haber',
      categoryId: 'son-dakika',
    })
    expect(current.system).toContain('Arda Şahin')
    expect(neu.system).toContain('Arda Şahin')
    expect(neu.system).toContain('NAHABER SUNUŞ')
    expect(current.system).not.toContain('NAHABER SUNUŞ')
    expect(current.user).toContain('https://example.com/haber')
    expect(neu.includesSource).toBe(true)
  })
})
