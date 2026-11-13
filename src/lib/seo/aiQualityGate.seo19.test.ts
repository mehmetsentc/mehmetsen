import { describe, expect, it, vi } from 'vitest'
import { failsAiQualityGate } from './aiQualityGate'

// SEO-19: from 22 Oct, length alone no longer makes an AI story indexable.
const base = {
  aiGenerated: true,
  seoWordCount: 520,
  seoResearchSourceCount: 0,
  publishedAt: '2026-11-10T10:00:00Z',
}

describe('SEO-19 strict AI index gate', () => {
  it('generic 520-word rewrite without a city → noindex', () => {
    expect(failsAiQualityGate({ ...base, citySlug: null })).toBe(true)
  })
  it('local story (any Turkish province) → indexable', () => {
    expect(failsAiQualityGate({ ...base, citySlug: 'bayburt' })).toBe(false)
    expect(failsAiQualityGate({ ...base, citySlug: 'canakkale', seoWordCount: 180 })).toBe(false)
  })
  it('a non-province slug does not count as local', () => {
    expect(failsAiQualityGate({ ...base, citySlug: 'turkiye' })).toBe(true)
  })
  it('researched, editor pick, featured, analysis → indexable', () => {
    expect(failsAiQualityGate({ ...base, seoResearchSourceCount: 2 })).toBe(false)
    expect(failsAiQualityGate({ ...base, isEditorPick: true })).toBe(false)
    expect(failsAiQualityGate({ ...base, featured: true })).toBe(false)
    expect(failsAiQualityGate({ ...base, articleFormat: 'analysis' })).toBe(false)
  })
  it('stories before 22 Oct keep the old 400-word rule', () => {
    expect(failsAiQualityGate({ ...base, publishedAt: '2026-10-18T10:00:00Z' })).toBe(false)
    expect(failsAiQualityGate({ ...base, publishedAt: '2026-10-18T10:00:00Z', seoWordCount: 200 })).toBe(true)
  })
  it('human-written stories never move; kill switches work', () => {
    expect(failsAiQualityGate({ ...base, aiGenerated: false })).toBe(false)
    vi.stubEnv('SEO_AI_STRICT_GATE', 'off')
    expect(failsAiQualityGate({ ...base })).toBe(false)
    vi.unstubAllEnvs()
    expect(failsAiQualityGate({ ...base }, false)).toBe(false)
  })
})
