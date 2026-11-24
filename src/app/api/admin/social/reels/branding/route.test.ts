/** BRAND-CITY-1 — il ses/renk ayarları: kaydetme, öneri, denetim kaydı. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  saved: [] as Array<{ patch: Record<string, unknown>; uid: string }>,
  audits: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/social/accounts/connect/routeHelpers', () => ({
  requireAccountManager: async () => ({ ctx: { uid: 'u1' } }),
  readJsonBody: async (r: Request) => r.json(),
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
}))
vi.mock('@/lib/social/accounts/audit', () => ({ writeSocialAudit: async (e: Record<string, unknown>) => void h.audits.push(e) }))
vi.mock('@/lib/reels/voiceSettings', async () => {
  const { parseVoiceSettings } = await import('@/lib/reels/voiceRules')
  return {
    getReelVoiceSettings: async () => parseVoiceSettings(h.stored),
    saveReelVoiceSettings: async (patch: Record<string, unknown>, uid: string) => {
      h.saved.push({ patch, uid })
      h.stored = { ...h.stored, ...JSON.parse(JSON.stringify(patch)) }
      return parseVoiceSettings(h.stored)
    },
    listTurkishVoices: async () => ({ voices: [], source: 'static' }),
  }
})

import { GET, POST } from './route'

const post = (body: unknown) => POST(new Request('https://x/api/admin/social/reels/branding', { method: 'POST', body: JSON.stringify(body) }))

describe('/api/admin/social/reels/branding', () => {
  beforeEach(() => {
    h.stored = {}
    h.saved = []
    h.audits = []
  })

  it('GET: 81 il, gruplar (spor her ilde aynı), kapalı başlar', async () => {
    const body = (await (await GET(new Request('https://x'))).json()) as Record<string, any>
    expect(body.provinces).toHaveLength(81)
    expect(body.branding.enabled).toBe(false)
    expect(body.branding.groups.spor.sameEverywhere).toBe(true)
    expect(body.groups.find((g: any) => g.id === 'spor').presenter.name).toBe('Kerem')
    expect(body.music).not.toContain('auto')
  })

  it('öneri kaydetmez, 81 ili doldurur', async () => {
    const body = (await (await post({ action: 'suggest' })).json()) as Record<string, any>
    expect(Object.keys(body.suggestion.cities)).toHaveLength(81)
    expect(h.saved).toHaveLength(0)
  })

  it('kaydeder, geçersizi atar, denetim kaydına değişen illeri yazar', async () => {
    const body = (await (
      await post({ enabled: true, cities: { antalya: { presenterName: 'Defne', voice: 'tr-TR-Wavenet-A', accent: '#00ACC1' }, ankara: { voice: 'kötü' } } })
    ).json()) as Record<string, any>
    expect(body.branding.enabled).toBe(true)
    expect(body.branding.cities).toEqual({ antalya: { presenterName: 'Defne', voice: 'tr-TR-Wavenet-A', rate: null, music: null, accent: '#00acc1' } })
    expect(h.saved[0]!.uid).toBe('u1')
    expect(h.audits[0]).toMatchObject({ action: 'social.branding.update', actorId: 'u1', meta: { enabled: true, enabledChanged: true, changedCities: ['antalya'], changedCount: 1 } })
  })

  it('yalnız gönderilen alan değişir', async () => {
    await post({ enabled: true, cities: { antalya: { voice: 'tr-TR-Wavenet-A' } } })
    const body = (await (await post({ groups: { spor: { sameEverywhere: false, music: 'enerjik' } } })).json()) as Record<string, any>
    expect(body.branding.enabled).toBe(true)
    expect(body.branding.cities.antalya.voice).toBe('tr-TR-Wavenet-A')
    expect(body.branding.groups.spor).toEqual({ sameEverywhere: false, music: 'enerjik' })
  })
})
