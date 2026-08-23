import { describe, expect, it } from 'vitest'
import { formatAiPublishSkipReasonTr } from './aiPublishSkipReasons'

describe('formatAiPublishSkipReasonTr', () => {
  it('maps known codes to Turkish', () => {
    expect(formatAiPublishSkipReasonTr('already_published')).toBe('Bu haber zaten yayınlanmış')
    expect(formatAiPublishSkipReasonTr('ai_duplicate')).toBe('AI benzer haber olarak işaretledi')
    expect(formatAiPublishSkipReasonTr('quality:incomplete_text')).toBe('Metin kesik veya eksik')
    expect(formatAiPublishSkipReasonTr('görsel yok')).toBe('Kapak görseli yok')
  })

  it('never returns the old vague mükerrer phrase', () => {
    expect(formatAiPublishSkipReasonTr(null)).not.toContain('mükerrer')
    expect(formatAiPublishSkipReasonTr('')).not.toContain('mükerrer')
    expect(formatAiPublishSkipReasonTr('story_library_duplicate')).not.toContain('mükerrer veya filtre')
  })
})
