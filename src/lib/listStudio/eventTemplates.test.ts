import { describe, expect, it } from 'vitest'
import { applyListPatch, cardsKey, cardsProblem, compileSegment, compileWhole, defaultList, effectiveRenderKey, eventSectionMs, introMs, listRenderKey, segOfItem, segmentIds, wholeEligible, wholeRenderKey, type ListItem, type ListProject } from './listModel'
import { CARD_TEMPLATES, EVENT_TEMPLATES, TEMPLATE_INFO, VIDEO_TEMPLATES, cardCount, isCardTemplate, suggestTemplates } from './eventTemplates'
import { TRANSITION_MS } from '@/lib/edit/editProject'

const NOW = 1_764_000_000_000
const ev = (i: number) => ({ eventId: `e${i}`, date: `${20 + i} Kasım Cumartesi`, day: `${20 + i}`, mon: 'KAS', time: '21.00', venue: 'Açıkhava', city: 'Antalya', category: 'Konser', source: 'Biletix', price: '' })
const vid = (n: string, out = 10_000) => ({ kind: 'video' as const, url: `https://storage.googleapis.com/b/${n}.mp4`, name: `${n}.mp4`, durationMs: 60_000, inMs: 0, outMs: out, hasAudio: true })
function project(n: number, template = 'v3-hafta'): ListProject {
  const l = defaultList('lsEVT00000002', 'u1', NOW, 'etkinlik', n)
  l.voiceOn = false
  l.items = l.items.map((x, i) => ({ ...x, title: `Etkinlik ${i + 1}`, event: ev(i), media: vid(`k${i}`) }) as ListItem)
  const r = applyListPatch(l, { template }, NOW)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('etkinlik şablonları', () => {
  it('11 kart + 11 video, hepsinin bilgisi var', () => {
    expect(CARD_TEMPLATES).toHaveLength(11)
    expect(VIDEO_TEMPLATES).toHaveLength(11)
    for (const t of EVENT_TEMPLATES) expect(TEMPLATE_INFO[t].label).toBeTruthy()
    expect(isCardTemplate('k6-izgara')).toBe(true)
    expect(isCardTemplate('v1-turne')).toBe(false)
  })
  it('öneri etkinlik sayısına göre değişir ve türün içinden gelir', () => {
    const one = suggestTemplates(1, 'video')
    const many = suggestTemplates(8, 'video')
    expect(one.length).toBeGreaterThan(0)
    expect(one.every((t) => !isCardTemplate(t))).toBe(true)
    expect(suggestTemplates(6, 'kart').every((t) => isCardTemplate(t))).toBe(true)
    expect(one).not.toEqual(many)
  })
  it('kart sayısı: tek tek şablonda etkinlik başına, listede tek kare', () => {
    expect(cardCount('k1-buyukisim', 4)).toBe(4)
    expect(cardCount('k2-haftasonu', 4)).toBe(1)
    expect(cardCount('k11-set', 3)).toBeGreaterThanOrEqual(4)
  })
  it('şablon değişince renkler varsayılana döner; renk ayrıca değiştirilir, geçersiz renk reddedilir', () => {
    const l = project(2, 'v1-turne')
    expect(l.accent).toBe(TEMPLATE_INFO['v1-turne'].accent)
    expect(l.bgColor).toBe(TEMPLATE_INFO['v1-turne'].bg)
    const r = applyListPatch(l, { bgColor: '#112233', textColor: '#fefefe' }, NOW)
    expect(r.ok && r.value.bgColor).toBe('#112233')
    const bad = applyListPatch(l, { bgColor: 'kırmızı' }, NOW)
    expect(bad.ok && bad.value.bgColor === 'kırmızı').toBe(false)
    const u = applyListPatch(l, { template: 'olmayan' }, NOW)
    expect(u.ok && u.value.template === ('olmayan' as never)).toBe(false)
  })
  it('ek medya bölüm süresini uzatır (geçiş bindirmesi düşülür), en çok 3', () => {
    const l = project(1)
    const base = eventSectionMs(l, l.items[0]!)
    const r = applyListPatch(l, { items: [{ id: l.items[0]!.id, extras: [vid('x1', 4_000), vid('x2', 4_000), vid('x3', 4_000), vid('x4', 4_000)] }] }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const it0 = r.value.items[0]!
    expect(it0.extras.length).toBeLessThanOrEqual(3)
    expect(eventSectionMs(r.value, it0)).toBe(base + it0.extras.length * (4_000 - TRANSITION_MS))
    const c = compileSegment(r.value, segOfItem(it0.id))!
    expect(c.project.clips.length).toBe(1 + it0.extras.length)
    expect(c.project.clips.slice(1).every((x) => x.transition !== 'none')).toBe(true)
  })
  it('giriş düzeni şablona göre: liste girişleri daha uzun', () => {
    const a = project(5, 'v4-minimal')
    const b = project(5, 'v7-lineup')
    expect(introMs(b)).toBeGreaterThanOrEqual(introMs(a))
    const c = compileSegment(b, 'intro')!
    expect([...c.overlays.values()].some((o) => o.type === 'evintro')).toBe(true)
  })
  it('kinetik ve altyazı bölüm katmanları', () => {
    const k = project(1, 'v6-kinetik')
    const ck = compileSegment(k, segOfItem(k.items[0]!.id))!
    expect([...ck.overlays.values()].filter((o) => o.type === 'evword').length).toBe(3)
    const t = project(1, 'v2-tektarih')
    const ct = compileSegment(t, segOfItem(t.items[0]!.id))!
    expect([...ct.overlays.values()].some((o) => o.type === 'evbig')).toBe(true)
  })
  it('tek parça: önekli kimlikler, bölüm sınırında geçiş, tek fon müziği', () => {
    const l = project(3)
    l.transition = 'dissolve'
    l.music = 'on'
    expect(wholeEligible(l)).toBe(true)
    expect(effectiveRenderKey(l)).toBe(wholeRenderKey(l))
    const w = compileWhole(l)!
    const n = segmentIds(l).length
    const parts = segmentIds(l).map((s) => compileSegment(l, s)!)
    expect(w.project.clips.length).toBe(parts.reduce((a, p) => a + p.project.clips.length, 0))
    const ids = w.project.clips.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]!.startsWith('s0_')).toBe(true)
    expect(w.project.clips[0]!.transition).toBe('none')
    let idx = 0
    for (let i = 0; i < n; i++) {
      if (i > 0) expect(w.project.clips[idx]!.transition).toBe('dissolve')
      idx += parts[i]!.project.clips.length
    }
    expect(w.project.audio.filter((a) => a.id === 'a_music').length).toBeLessThanOrEqual(1)
    for (const a of w.project.assets) expect(a.id).toMatch(/^s\d+_/)
    for (const t of w.project.texts) expect(w.overlays.has(t.id) || true).toBe(true)
  })
  it('150 sn aşılırsa parça yolu; kart şablonu video anahtarını kullanmaz', () => {
    const l = project(12)
    l.items = l.items.map((x) => ({ ...x, media: vid(x.id, 20_000) }))
    expect(wholeEligible(l)).toBe(false)
    expect(effectiveRenderKey(l)).toBe(listRenderKey(l))
    const k = project(3, 'k6-izgara')
    expect(wholeEligible(k)).toBe(false)
    expect(cardsProblem(k)).toBeNull()
    expect(cardsProblem(project(3))).toBeTruthy()
  })
  it('kart anahtarı renk ve şablonla değişir', () => {
    const k = project(3, 'k1-buyukisim')
    const a = cardsKey(k)
    const r = applyListPatch(k, { accent: '#00ff00' }, NOW)
    expect(r.ok && cardsKey(r.value)).not.toBe(a)
    const r2 = applyListPatch(k, { template: 'k4-bilet' }, NOW)
    expect(r2.ok && cardsKey(r2.value)).not.toBe(a)
  })
})
