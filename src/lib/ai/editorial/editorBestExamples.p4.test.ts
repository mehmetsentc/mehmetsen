import { describe, expect, it } from 'vitest'
import { formatBestExamplesForPrompt, type EditorBestExample } from './editorBestExamples'

describe('P4 Track C — formatBestExamplesForPrompt', () => {
  it('returns empty string when there are no examples', () => {
    expect(formatBestExamplesForPrompt([])).toBe('')
  })

  it('frames high-score past articles as style examples, not facts', () => {
    const examples: EditorBestExample[] = [
      {
        newsId: 'n1',
        title: 'Belediye otobüs seferlerini artırdı',
        summary: 'Sabah pik saatlerine üç ek sefer kondu.',
        publishScore: 88,
        gateDecision: 'publish',
        publishedAt: '2026-09-01T10:00:00.000Z',
      },
    ]
    const block = formatBestExamplesForPrompt(examples)
    expect(block).toContain('YÜKSEK PUAN ALAN ÖRNEKLER')
    expect(block).toContain('Belediye otobüs seferlerini artırdı')
    expect(block).toContain('kopyalama yok')
    expect(block).not.toContain('VERIFIED_FACT')
  })
})
