import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MIN_NEWS_BODY_WORDS, SEO_INDEXABLE_BODY_WORDS, TARGET_NEWS_BODY_WORDS_MAX, TARGET_NEWS_BODY_WORDS_MIN } from '@/lib/contentQuality'
import { AI_QUALITY_MIN_WORDS } from '@/lib/seo/aiQualityGate'

describe('SEO-13 AI news length target', () => {
  it('targets 450–650 words, index floor equals the gate, publish floor unchanged', () => {
    expect(TARGET_NEWS_BODY_WORDS_MIN).toBe(450)
    expect(TARGET_NEWS_BODY_WORDS_MAX).toBe(650)
    expect(SEO_INDEXABLE_BODY_WORDS).toBe(AI_QUALITY_MIN_WORDS)
    expect(MIN_NEWS_BODY_WORDS).toBe(220)
  })
  it('every news writer prompt asks for ≥400 words without padding', () => {
    for (const f of [
      'src/services/newsroom/editors/stage1_contentWriter.ts',
      'src/lib/ai/editorial/seedEditors.ts',
      'src/services/newsroom/trendEditor.ts',
      'src/services/aiNewsEditor.ts',
      'src/app/api/admin/ai-assist/route.ts',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toContain('450-650')
      expect(src, f).not.toContain('250-450')
    }
    const lock = readFileSync('src/lib/ai/editorial/promptBuilder.ts', 'utf8')
    expect(lock).toContain('eski uzunluk talimatlarını ezer')
    expect(lock).toContain('uydurmak kısa yazmaktan her zaman kötüdür')
  })
})
