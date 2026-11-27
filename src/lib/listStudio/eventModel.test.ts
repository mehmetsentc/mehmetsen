import { describe, expect, it } from 'vitest'
import { applyListPatch, compileSegment, defaultList, defaultListCaption, eventAnnounce, eventSectionMs, listVoiceHash, segOfItem, segmentKey, type ListItem, type ListProject } from './listModel'

const NOW = 1_764_000_000_000
const ev = { eventId: 'e1', date: '28 Kasım Cumartesi', day: '28', mon: 'KAS', time: '21.00', venue: 'Açıkhava Tiyatrosu', city: 'Antalya', category: 'Konser', source: 'Biletix', price: '' }
function project(media: ListItem['media'], over: Partial<ListItem> = {}): ListProject {
  const l = defaultList('lsEVT00000001', 'u1', NOW, 'etkinlik', 1)
  l.watermark = { text: '@antalyaetkinlik', pos: 'sag-ust', opacity: 0.8 }
  l.publisher = { name: 'Antalya Etkinlik', handle: 'antalyaetkinlik', slogan: 'Takip et' }
  l.items = [{ ...l.items[0]!, title: 'Sezen Aksu', subtitle: 'Açıkhava', event: { ...ev }, media, voice: null, ...over }]
  return l
}
const concert = { kind: 'video' as const, url: 'https://storage.googleapis.com/b/konser.mp4', name: 'konser.mp4', durationMs: 60_000, inMs: 0, outMs: 20_000, hasAudio: true }
const voice = { url: 'https://storage.googleapis.com/b/v.wav', durationMs: 5_000, hash: 'x', createdAt: NOW }

describe('etkinlik videosu', () => {
  it('anons NaHaber adı içermez, saat okunuşa göre ek alır', () => {
    const t = eventAnnounce({ title: 'Sezen Aksu', event: ev } as ListItem)
    expect(t).toContain("21.00'de")
    expect(t).toContain('Biletix')
    expect(t).not.toMatch(/nahaber/i)
  })
  it('önce konser sesi: anlatım seçilen saniyede başlar, fon müziği anlatımla girer', () => {
    const l = project(concert, { ownFirst: true, narrStartMs: 8_000, announce: 'x' })
    // ses güncel sayılsın
    const it0 = l.items[0]!
    const c = compileSegment({ ...l, items: [{ ...it0, voice: { ...voice, hash: listVoiceHash(l.pack, l.voiceId, 'x') } }] }, segOfItem(it0.id))!
    const v = c.project.audio.find((a) => a.kind === 'voice')!
    expect(v.startMs).toBe(8_000)
    const m = c.project.audio.find((a) => a.id === 'a_music')!
    expect(m.startMs).toBe(8_000)
    expect(c.duck).toBe(true)
    expect([...c.overlays.values()].map((o) => o.type)).toEqual(expect.arrayContaining(['evtitle', 'evcard', 'wm']))
  })
  it('«kapanır»: klip ikiye bölünür, ikinci parça sessiz', () => {
    const l = project(concert, { ownFirst: true, narrStartMs: 8_000, duck: 'kapali' })
    const c = compileSegment(l, segOfItem(l.items[0]!.id))!
    expect(c.project.clips).toHaveLength(2)
    expect(c.project.clips[1]!.mute).toBe(true)
    expect(c.project.clips[0]!.outMs).toBe(8_000)
  })
  it('müzik seçenekleri: kendi müziği → fon yok, klip sesli; müziksiz → klip sessiz', () => {
    const own = project(concert)
    own.music = 'own'
    const a = compileSegment(own, segOfItem(own.items[0]!.id))!
    expect(a.project.audio.some((x) => x.id === 'a_music')).toBe(false)
    expect(a.project.clips[0]!.mute).toBe(false)
    const off = project(concert)
    off.music = 'off'
    const b = compileSegment(off, segOfItem(off.items[0]!.id))!
    expect(b.project.audio.some((x) => x.id === 'a_music')).toBe(false)
    expect(b.project.clips[0]!.mute).toBe(true)
    expect(segmentKey(own, segOfItem(own.items[0]!.id))).not.toBe(segmentKey(off, segOfItem(off.items[0]!.id)))
  })
  it('görsel: süre anlatım sığacak kadar uzar', () => {
    const l = project({ kind: 'image', url: 'https://x.com/a.jpg', name: 'a', durationMs: null, inMs: 0, outMs: 5_000 }, { narrStartMs: 600, voice })
    expect(eventSectionMs(l, l.items[0]!)).toBe(600 + 5_000 + 1_200)
  })
  it('yama: müzik kipi, filigran ve etkinlik bilgisi düzenlenir', () => {
    const l = project(concert)
    const r = applyListPatch(l, { music: 'own', watermark: { text: '@yeni', pos: 'sol-alt' }, items: [{ id: l.items[0]!.id, narrStartMs: 3_000, duck: 'acik', event: { time: '20.30' } }] }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.music).toBe('own')
    expect(r.value.watermark).toEqual({ text: '@yeni', pos: 'sol-alt', opacity: 0.8 })
    expect(r.value.items[0]!.event!.time).toBe('20.30')
    expect(r.value.items[0]!.event!.venue).toBe('Açıkhava Tiyatrosu')
    expect(r.value.items[0]!.duck).toBe('acik')
  })
  it('paylaşım metni il etiketi içerir, NaHaber içermez', () => {
    const c = defaultListCaption(project(concert))
    expect(c).toContain('#antalya')
    expect(c).toContain('Sezen Aksu')
    expect(c).not.toMatch(/nahaber/i)
  })
})
