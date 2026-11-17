/** AI cevap taslağı: kategori birleştirme, güvensiz çıktı, AI kapalı. Gerçek AI yok. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ result: null as unknown, lanes: [] as string[] }))
vi.mock('@/lib/ai/router/aiRouter', () => ({
  runAI: vi.fn(async (input: { validate: (raw: string) => unknown }) => {
    const { getAiUsageContext } = await import('@/lib/ai/usage/context')
    h.lanes.push(String(getAiUsageContext()?.ingestionLane))
    if (h.result === 'off') return { value: null, provider: null, fallback: false }
    return { value: input.validate(JSON.stringify(h.result)), provider: 'gemini', fallback: false }
  }),
}))
vi.mock('../testEnvironment', () => ({ isSocialTestMode: () => false }))

import { draftReply, mergeCategory } from './ai'

const base = { kind: 'comment' as const, platform: 'instagram', newsTitle: 'Antalya’da yeni park', newsUrl: 'https://www.nahaber.com/haber/park', lane: 'manual_editor' as const, maxLength: 2000 }

beforeEach(() => {
  h.lanes = []
})

describe('draftReply', () => {
  it('sıkı kategori kazanır: kural «şikâyet» diyorsa model «teşekkür» dese de kişiye kalır', async () => {
    expect(mergeCategory('complaint', 'thanks')).toBe('complaint')
    expect(mergeCategory('thanks', 'political')).toBe('political')
    expect(mergeCategory('other', 'link_request')).toBe('link_request')
    h.result = { category: 'thanks', needs_human: false, reply: 'Teşekkürler, düzeltme talebinizi ilettik.' }
    const r = await draftReply({ ...base, text: 'Yalan haber, düzeltin' })
    expect(r).toMatchObject({ category: 'complaint', needsHuman: true, reason: 'ok' })
    expect(h.lanes).toEqual(['manual_editor'])
  })

  it('başka siteye link içeren AI metni reddedilir', async () => {
    h.result = { category: 'link_request', needs_human: false, reply: 'Buradan okuyun: https://baska.example/x' }
    const r = await draftReply({ ...base, text: 'link?' })
    expect(r).toMatchObject({ text: null, reason: 'unsafe_output', needsHuman: true })
  })

  it('AI kapalıysa metin yok, kural kategorisi döner; otomatik çalışan crawler kapısından geçer', async () => {
    h.result = 'off'
    const r = await draftReply({ ...base, text: 'Teşekkürler', lane: 'automated' })
    expect(r).toMatchObject({ text: null, category: 'thanks', reason: 'ai_off' })
    expect(h.lanes).toEqual(['crawler'])
  })
})
