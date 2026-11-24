/** EVENT-DESK-1 — AI etkinlik haberi: yalnız etkinlik bilgisinden, unvan denetimi, kategori/il, seslendirme. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeFirestore } from '@/lib/social/accounts/testing/fakeFirestore'

const h = vi.hoisted(() => ({ db: null as unknown, prompts: [] as string[], reply: '' }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => h.db }))
vi.mock('@/lib/cmsAuthServer', () => ({ verifyCmsToken: async () => ({ uid: 'u1', role: 'editor', email: '', scope: { kind: 'unscoped' } }) }))
vi.mock('@/services/crawler/automatedAiPolicy', () => ({ isManualEditorAiEnabled: () => true }))
vi.mock('@/lib/ai/deepseekClient', () => ({
  deepseekChatCompletion: async (o: { messages: Array<{ content: string }> }) => {
    h.prompts.push(o.messages.map((m) => m.content).join('\n'))
    return h.reply
  },
}))
vi.mock('@/lib/reels/voiceSettings', async () => {
  const { parseVoiceSettings } = await import('@/lib/reels/voiceRules')
  return { getReelVoiceSettings: async () => parseVoiceSettings({ cityBranding: { enabled: true, cities: { canakkale: { presenterName: 'Defne', voice: 'tr-TR-Wavenet-A', rate: 1.02 } } } }) }
})

import { POST } from './route'
import { invalidateDeskCache } from '@/lib/events/eventDeskStore'

describe('POST /api/admin/events/desk/news', () => {
  beforeEach(async () => {
    const fs = new FakeFirestore()
    h.db = fs
    h.prompts = []
    invalidateDeskCache()
    await fs.collection('events').doc('tm_1').set({ title: 'Cihan Mürtezaoğlu', description: 'Sanatçı sevilen şarkılarını seslendirecek.', category: 'concert', city: 'Çanakkale', citySlug: 'canakkale', venue: 'The Keep', startsAt: '2030-01-11T18:30:00.000Z', status: 'published', source: 'ticketmaster', provider: 'Ticketmaster', coverImageUrl: 'https://img/c.jpg' })
    await fs.collection('eventDesk').doc('tm_1').set({ info: { price: '750 TL', note: 'Yeni albüm turnesi.' } })
  })

  it('taslak, kategori, il ve il sunucusuyla seslendirme döner; editör notu ve fiyat AI girdisinde', async () => {
    vi.setSystemTime(new Date('2029-12-01T10:00:00Z'))
    h.reply = JSON.stringify({ title: "Cihan Mürtezaoğlu 11 Ocak'ta Çanakkale'de sahne alacak", spot: "Konser 21.30'da The Keep'te.", content: "## Etkinlik Bilgileri\n- Yer: The Keep\n- Saat: 21.30\n- Bilet: 750 TL\n\n## Etkinlik Hakkında\nSanatçı sevilen şarkılarını seslendirecek.", tags: ['konser'] })
    const res = await POST(new Request('https://x', { method: 'POST', body: JSON.stringify({ eventId: 'tm_1' }) }))
    const body = (await res.json()) as Record<string, any>
    expect(res.status).toBe(200)
    expect(body.news).toMatchObject({ categoryId: 'yerel-konser', citySlug: 'canakkale', thumbnail: 'https://img/c.jpg', eventId: 'tm_1' })
    expect(body.draft.tags).toEqual(['çanakkale', 'konser'])
    expect(body.voice).toMatchObject({ presenter: 'Defne', voice: 'tr-TR-Wavenet-A', source: 'city' })
    expect(body.voice.script).toContain("saat 21.30'da")
    expect(h.prompts[0]).toContain('Bilet fiyatı: 750 TL')
    expect(h.prompts[0]).toContain('Editör notu: Yeni albüm turnesi.')
    vi.useRealTimers()
  })

  it('kaynakta olmayan unvanı çıkarır', async () => {
    vi.setSystemTime(new Date('2029-12-01T10:00:00Z'))
    h.reply = JSON.stringify({ title: "Cihan Mürtezaoğlu 11 Ocak'ta Çanakkale'de", spot: 'S', content: 'Bu akşam CHP Genel Başkanı Cihan Mürtezaoğlu konuşma yapacak ve ardından konser başlayacak, biletler satışta.' })
    const body = (await (await POST(new Request('https://x', { method: 'POST', body: JSON.stringify({ eventId: 'tm_1' }) }))).json()) as Record<string, any>
    expect(body.draft.content).not.toContain('CHP Genel Başkanı')
    vi.useRealTimers()
  })

  it('bozuk AI cevabında 502, olmayan etkinlikte 404', async () => {
    vi.setSystemTime(new Date('2029-12-01T10:00:00Z'))
    h.reply = 'bozuk'
    expect((await POST(new Request('https://x', { method: 'POST', body: JSON.stringify({ eventId: 'tm_1' }) }))).status).toBe(502)
    expect((await POST(new Request('https://x', { method: 'POST', body: JSON.stringify({ eventId: 'yok' }) }))).status).toBe(404)
    vi.useRealTimers()
  })
})
