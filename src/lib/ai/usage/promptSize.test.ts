import { describe, expect, it } from 'vitest'
import { estimateTokensFromChars, measureStage1PromptParts } from '@/lib/ai/usage/promptSize'

describe('Stage1 prompt size accounting', () => {
  it('returns only numeric sizes, never source text', () => {
    const source = 'Gizli haber metni Çanakkale feribot 40 TL'
    const parts = measureStage1PromptParts({
      systemContent: 'Sen NaHaber editörüsün. MUTLAK KURALLAR.',
      sourceArticle: source,
      userContent: `Kaynak URL: https://example.com
Başlık: Test
Özet: kısa
İçerik:
${source}
GAZETE HABERİ yaz (ters piramit).
JSON:
{"title":"string"}`,
    })
    const serialized = JSON.stringify(parts)
    expect(serialized).not.toContain('Gizli haber')
    expect(serialized).not.toContain('feribot')
    expect(parts.sourceChars).toBe(source.length)
    expect(parts.systemTokens).toBe(estimateTokensFromChars(parts.systemChars))
    expect(parts.totalTokens).toBe(
      parts.systemTokens + parts.sourceTokens + parts.instructionTokens + parts.otherTokens
    )
  })
})
