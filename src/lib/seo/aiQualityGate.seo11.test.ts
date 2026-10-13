import { describe, expect, it } from 'vitest'
import { failsAiQualityGate, AI_QUALITY_GATE_CUTOFF_MS } from './aiQualityGate'
import { ARTICLE_SITEMAP_FIRESTORE_FIELDS } from '@/lib/sitemap/articleSitemap'
import { buildPostMetadata } from '@/lib/seo'
import type { Post } from '@/types/post'

const after = AI_QUALITY_GATE_CUTOFF_MS + 3_600_000
const ai = (o: Record<string, unknown> = {}) => ({
  aiEditorId: 'ai_editor_x',
  publishedAt: after,
  seoWordCount: 250,
  citySlug: 'manisa',
  ...o,
})

describe('SEO-11 AI quality gate', () => {
  it('short AI rewrite from a non-focus city after cutoff → gated', () => {
    expect(failsAiQualityGate(ai(), true)).toBe(true)
  })
  it('passes: focus city, long body, researched, editor pick, analysis', () => {
    expect(failsAiQualityGate(ai({ citySlug: 'canakkale' }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ citySlug: 'Antalya' }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ seoWordCount: 400 }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ seoWordCount: 320, seoResearchSourceCount: 2 }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ isEditorPick: true }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ articleFormat: 'analysis' }), true)).toBe(false)
  })
  it('never touches old, human or uncounted articles; kill switch works', () => {
    expect(failsAiQualityGate(ai({ publishedAt: AI_QUALITY_GATE_CUTOFF_MS - 1 }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ aiEditorId: undefined, authorId: 'u_123' }), true)).toBe(false)
    expect(failsAiQualityGate(ai({ seoWordCount: undefined }), true)).toBe(false)
    expect(failsAiQualityGate(ai(), false)).toBe(false)
  })
  it('accepts ISO string dates', () => {
    expect(failsAiQualityGate(ai({ publishedAt: new Date(after).toISOString() }), true)).toBe(true)
  })
  it('sitemap projection carries the gate inputs', () => {
    for (const f of ['seoWordCount', 'seoResearchSourceCount', 'citySlug', 'aiEditorId', 'featured', 'articleFormat']) {
      expect(ARTICLE_SITEMAP_FIRESTORE_FIELDS).toContain(f)
    }
  })
  it('page robots: gated article → noindex, follow', () => {
    const post = {
      id: 'a1', slug: 'kisa-haber', title: 'Kısa haber', content: 'x', summary: 's',
      categoryId: 'gundem', tags: [], visibility: 'public', status: 'published',
      authorId: 'ai_editor_x', aiEditorId: 'ai_editor_x', authorIsAI: true,
      publishedAt: new Date(after).toISOString(), createdAt: new Date(after).toISOString(),
      seoWordCount: 200, citySlug: 'manisa',
    } as unknown as Post
    const meta = buildPostMetadata(post, { robotsOverride: { index: true, follow: true } })
    const robots = meta.robots as { index: boolean; follow: boolean }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(true)
    const ok = buildPostMetadata({ ...post, seoWordCount: 500 } as Post, { robotsOverride: { index: true, follow: true } })
    expect((ok.robots as { index: boolean }).index).toBe(true)
  })
})
