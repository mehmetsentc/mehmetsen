import { describe, expect, it } from 'vitest'
import {
  applyListPatch,
  compileSegment,
  defaultAnnounce,
  defaultList,
  itemVoiceCurrent,
  listRenderKey,
  listRenderProblem,
  listTotalMs,
  listVoiceHash,
  parsePastedList,
  platformFit,
  playOrder,
  segmentIds,
  segmentKey,
  segmentsToRender,
  transitionFor,
  type ListProject,
} from './listModel'

const NOW = 1_764_000_000_000
const video = (url: string, durationMs = 60_000) => ({ kind: 'video' as const, url, name: 'klip.mp4', durationMs, inMs: 10_000, outMs: 30_000, hasAudio: true, width: 1080, height: 1920 })

function ready(n = 3): ListProject {
  const l = defaultList('lsTEST0000001', 'u1', NOW, 'pop', n)
  l.publisher = { name: 'Müzik Listesi', handle: 'muziklistesi', slogan: 'Takip et' }
  l.voiceOn = false
  l.items = l.items.map((x, i) => ({ ...x, title: `Şarkı ${i + 1}`, subtitle: `Sanatçı ${i + 1}`, media: video(`https://storage.googleapis.com/b/clip${i}.mp4`) }))
  return l
}

describe('liste modeli', () => {
  it('sıra sayısı seçilebilir, varsayılan geri sayım N → 1', () => {
    const l = defaultList('lsTEST0000001', 'u1', NOW, 'netflix-dizi', 20)
    expect(l.items).toHaveLength(20)
    expect(l.pack).toBe('fragman')
    expect(l.bars).toBe(true)
    const order = playOrder(ready(5))
    expect(order.map((x) => x.rank)).toEqual([5, 4, 3, 2, 1])
    expect(playOrder({ ...ready(3), countdown: false }).map((x) => x.rank)).toEqual([1, 2, 3])
  })

  it('yapıştırılan listeyi ayrıştırır (müzik: Sanatçı – Şarkı, film: başlık)', () => {
    const m = parsePastedList('1. Tarkan - Kuzu Kuzu\n2) Sezen Aksu – Gülümse\n\n#3 Sıla — Vaziyetler\nYalnız Ad', 'muzik')
    expect(m).toEqual([
      { title: 'Kuzu Kuzu', subtitle: 'Tarkan' },
      { title: 'Gülümse', subtitle: 'Sezen Aksu' },
      { title: 'Vaziyetler', subtitle: 'Sıla' },
      { title: 'Yalnız Ad', subtitle: '' },
    ])
    const f = parsePastedList('1. Dune: Part Three - Bilim kurgu\n2. Kızıl Goncalar', 'sinema')
    expect(f[0]).toEqual({ title: 'Dune: Part Three', subtitle: 'Bilim kurgu' })
    expect(f[1]).toEqual({ title: 'Kızıl Goncalar', subtitle: '' })
  })

  it('yama: sıra ekle / sil / sırala; medya URL değiştirilemez, kesim 5–60 sn içinde', () => {
    const l = ready(3)
    l.items[0] = { ...l.items[0]!, media: video('https://storage.googleapis.com/b/uzun.mp4', 200_000) }
    const [a, b, c] = l.items
    const r = applyListPatch(l, { items: [{ id: c!.id }, { id: a!.id, media: { inMs: 0, outMs: 120_000, url: 'https://evil' } }, { id: 'yeniSira1', title: 'Yeni' }] }, NOW + 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.items.map((x) => x.id)).toEqual([c!.id, a!.id, 'yeniSira1'])
    expect(r.value.items[1]!.media!.url).toBe(a!.media!.url)
    expect(r.value.items[1]!.media!.outMs - r.value.items[1]!.media!.inMs).toBe(60_000)
    expect(r.value.items[2]!.media).toBeNull()
    expect(r.value.items.some((x) => x.id === b!.id)).toBe(false)
    expect(applyListPatch(l, { items: [] }, NOW).ok).toBe(false)
    expect(applyListPatch(l, { accent: 'red' }, NOW).ok).toBe(false)
    expect(applyListPatch(l, { transition: 'karisik' }, NOW).ok).toBe(true)
  })

  it('parçalar: giriş + her sıra + kapanış; NaHaber kapanışı yok', () => {
    const l = ready(3)
    const ids = segmentIds(l)
    expect(ids[0]).toBe('intro')
    expect(ids[ids.length - 1]).toBe('outro')
    expect(ids).toHaveLength(5)
    for (const s of ids) {
      const c = compileSegment(l, s)
      expect(c).not.toBeNull()
      expect(c!.project.closing).toBe(false)
    }
    const item = compileSegment(l, ids[1]!)!
    // sıra kartı + klip; klip kesimi korunur, geçiş pakete göre
    expect(item.project.clips).toHaveLength(2)
    expect(item.project.clips[1]!.inMs).toBe(10_000)
    expect(item.project.clips[1]!.outMs).toBe(30_000)
    expect(item.project.clips[1]!.transition).toBe(transitionFor(l, 0))
    const kinds = [...item.overlays.values()].map((o) => o.type)
    expect(kinds).toContain('rank')
    expect(kinds).toContain('badge')
    expect(kinds).toContain('ad') // alt bant
    // her varlık kimliği tek
    const aid = item.project.assets.map((a) => a.id)
    expect(new Set(aid).size).toBe(aid.length)
  })

  it('karışık geçiş pakete göre dönüşümlü; seçili geçiş sabit', () => {
    const l = ready(3)
    expect(transitionFor(l, 0)).not.toBe(transitionFor(l, 1))
    expect(transitionFor({ ...l, transition: 'fade' }, 5)).toBe('fade')
  })

  it('üretim kontrolü: klip, yayıncı, anons sesi', () => {
    const l = ready(3)
    expect(listRenderProblem(l)).toBeNull()
    expect(listRenderProblem({ ...l, publisher: { name: '', handle: '', slogan: '' } })).toMatch(/yayıncı/)
    const noClip = { ...l, items: l.items.map((x, i) => (i === 1 ? { ...x, media: null } : x)) }
    expect(listRenderProblem(noClip)).toMatch(/klip/)
    const voiced = { ...l, voiceOn: true, items: l.items.map((x) => ({ ...x, announce: 'Bir numara!' })) }
    expect(listRenderProblem(voiced)).toMatch(/anons/)
    const v = { url: 'https://x/v.wav', durationMs: 1800, hash: listVoiceHash(l.pack, l.voiceId, 'Bir numara!'), createdAt: NOW }
    const done = { ...voiced, items: voiced.items.map((x) => ({ ...x, voice: v })) }
    expect(itemVoiceCurrent(done, done.items[0]!)).toBe(true)
    expect(listRenderProblem(done)).toBeNull()
  })

  it('anahtarlar: bir sıra değişince yalnız o parça yeniden üretilir', () => {
    const l = ready(3)
    const keys = Object.fromEntries(segmentIds(l).map((s) => [s, segmentKey(l, s)]))
    const withSegs = { ...l, segments: Object.fromEntries(Object.entries(keys).map(([s, key]) => [s, { key, url: `u/${s}`, seconds: 20 }])) }
    expect(segmentsToRender(withSegs)).toEqual([])
    const changed = { ...withSegs, items: withSegs.items.map((x, i) => (i === 0 ? { ...x, title: 'Yeni ad' } : x)) }
    expect(segmentsToRender(changed)).toEqual([`i_${l.items[0]!.id}`])
    expect(listRenderKey(changed)).not.toBe(listRenderKey(withSegs))
  })

  it('süre ve platform rozeti', () => {
    const l = ready(10)
    const ms = listTotalMs(l)
    expect(ms).toBeGreaterThan(10 * 20_000)
    const fit = platformFit(ms, '9:16')
    expect(fit.find((x) => x.platform === 'Instagram Reels')!.ok).toBe(false)
    expect(fit.find((x) => x.platform === 'YouTube')!.note).toMatch(/Normal video/)
    expect(platformFit(120_000, '9:16').find((x) => x.platform === 'YouTube')!.note).toMatch(/Shorts/)
  })

  it('anons şablonları', () => {
    const l = ready(10)
    expect(defaultAnnounce(l, { title: 'Gülümse', subtitle: 'Sezen Aksu', change: 'new', prevRank: null, weeks: null }, 3)).toBe('3 numarada… Sezen Aksu, «Gülümse»! Listeye yeni giriş!')
    expect(defaultAnnounce(l, { title: 'X', subtitle: 'Y', change: 'up', prevRank: 7, weeks: null }, 1)).toMatch(/^Ve bu haftanın bir numarası… Y, «X»! Geçen hafta 7/)
    expect(defaultAnnounce({ ...l, pack: 'fragman', listType: 'netflix-film' }, { title: 'Dune', subtitle: '', change: 'none', prevRank: null, weeks: 4 }, 2)).toBe('2. sırada… «Dune». 4 haftadır listede!')
  })
})

describe('liste paylaşımı', () => {
  const done = (seconds: number, aspect: ListProject['aspect'] = '9:16'): ListProject => {
    const l = ready(3)
    return { ...l, aspect, render: { status: 'ready', key: 'k1', outputUrl: 'https://storage.googleapis.com/b/x.mp4', coverUrl: null, seconds, error: null, renderedAt: NOW } }
  }
  it('platform sınırları ve güncel render', async () => {
    const { listShareProblem, youtubeIsLong } = await import('./listModel')
    expect(listShareProblem(ready(3), 'instagram', 'reel')).toMatch(/üretin/)
    expect(listShareProblem(done(60), 'instagram', 'reel', 'baska')).toMatch(/yeniden üretin/)
    expect(listShareProblem(done(300), 'instagram', 'reel', 'k1')).toBeNull()
    expect(listShareProblem(done(120), 'facebook', 'reel')).toMatch(/90 sn/)
    expect(listShareProblem(done(400), 'threads', 'reel')).toMatch(/5 dk/)
    expect(listShareProblem(done(50), 'threads', 'video_story')).toMatch(/desteklemez/)
    expect(listShareProblem(done(50), 'instagram', 'video_story')).toBeNull()
    expect(listShareProblem(done(300, '16:9'), 'instagram', 'reel')).toMatch(/dikey/)
    expect(listShareProblem(done(600, '16:9'), 'youtube', 'reel')).toBeNull()
    expect(youtubeIsLong(done(170))).toBe(false)
    expect(youtubeIsLong(done(200))).toBe(true)
    expect(youtubeIsLong(done(60, '16:9'))).toBe(true)
  })
  it('otomatik paylaşım metni: sıralar, takip, etiketler; NaHaber yok', async () => {
    const { captionFor, defaultListCaption } = await import('./listModel')
    const l = { ...ready(3), introSubtitle: 'Hafta 48' }
    const c = defaultListCaption(l)
    expect(c).toContain('Top 3 (Hafta 48)')
    expect(c).toContain('1. Şarkı 1 – Sanatçı 1')
    expect(c).toContain('@muziklistesi')
    expect(c).toMatch(/#pop/)
    expect(c.toLowerCase()).not.toContain('nahaber')
    expect(captionFor({ ...l, caption: '  Elle yazılan  ' })).toBe('Elle yazılan')
  })
})

describe('teknoloji stüdyosu', () => {
  it('türler stüdyoya göre ayrılır; tür başka stüdyoya geçemez', async () => {
    const { typesOf, studioOf } = await import('./listModel')
    expect(typesOf('teknoloji')).toEqual(['tek-telefon', 'tek-bilgisayar', 'tek-tv', 'tek-urun', 'tek-ai', 'urun-tanitim', 'ai-tanitim', 'tek-haber'])
    expect(typesOf('muzik')).not.toContain('tek-telefon')
    const l = defaultList('lsTEST0000002', 'u1', NOW, 'tek-telefon', 10)
    expect(l.studio).toBe('teknoloji')
    expect(l.pack).toBe('tech')
    expect(studioOf('pop')).toBe('muzik')
    expect(applyListPatch(l, { listType: 'pop' }, NOW).ok).toBe(false)
    expect(applyListPatch(l, { listType: 'tek-ai' }, NOW).ok).toBe(true)
    // eski kayıtlar (studio alanı yok) müzik sayılır
    const { withListDefaults } = await import('./listModel')
    expect(withListDefaults({ id: 'lsOLD00000001', listType: 'pop' } as never).studio).toBe('muzik')
  })

  it('özellik paneli + fiyat; ürün modunda özellik kartı, rozet yok, sıra 1 → N', () => {
    const l = defaultList('lsTEST0000003', 'u1', NOW, 'urun-tanitim', 3)
    expect(l.countdown).toBe(false)
    l.publisher = { name: 'Tekno Vitrin', handle: 'teknovitrin', slogan: '' }
    l.voiceOn = false
    l.introTitle = 'iPhone 18 Pro'
    const r = applyListPatch(l, { items: l.items.map((x, i) => ({ id: x.id, title: ['Kamera', 'Ekran', 'Batarya'][i], subtitle: 'Açıklama', price: '1', specs: [{ label: 'Ana kamera', value: '48 MP' }, { label: '', value: '' }, ...Array.from({ length: 8 }, () => ({ label: 'x', value: 'y' }))] })) }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const it = r.value.items[0]!
    expect(it.specs).toHaveLength(5) // 6 ile kesilir, boş satır atılır
    const withMedia = { ...r.value, items: r.value.items.map((x) => ({ ...x, media: video('https://storage.googleapis.com/b/c.mp4') })) }
    expect(playOrder(withMedia).map((x) => x.rank)).toEqual([1, 2, 3])
    const seg = compileSegment(withMedia, segmentIds(withMedia)[1]!)!
    const kinds = [...seg.overlays.values()].map((o) => o.type)
    expect(kinds).toContain('specs')
    expect(kinds).not.toContain('badge')
    const rank = [...seg.overlays.values()].find((o) => o.type === 'rank')
    expect(rank && rank.type === 'rank' && rank.mode).toBe('urun')
    const intro = [...compileSegment(withMedia, 'intro')!.overlays.values()][0]
    expect(intro && intro.type === 'intro' && intro.kicker).toBe('YENİ')
  })

  it('teknoloji anonsları ve paylaşım metni', async () => {
    const { defaultListCaption, defaultIntroAnnounce } = await import('./listModel')
    const l = defaultList('lsTEST0000004', 'u1', NOW, 'tek-telefon', 3)
    expect(defaultAnnounce(l, { title: 'Galaxy S27', subtitle: 'Samsung', change: 'new', prevRank: null, weeks: null, price: '54.999 TL' }, 2)).toBe('2 numarada Samsung Galaxy S27. Fiyatı 54.999 TL. Listeye yeni girdi!')
    expect(defaultIntroAnnounce(l)).toMatch(/Top 3 listesi başlıyor/)
    const u = { ...defaultList('lsTEST0000005', 'u1', NOW, 'urun-tanitim', 2), introTitle: 'Pixel 11' }
    expect(defaultAnnounce(u, { title: 'Kamera', subtitle: '50 MP ana sensör', change: 'none', prevRank: null, weeks: null }, 1)).toBe('Kamera… 50 MP ana sensör.')
    expect(defaultIntroAnnounce(u)).toBe('Pixel 11 karşınızda! İşte öne çıkan 2 özellik.')
    const c = defaultListCaption({ ...l, items: l.items.map((x, i) => ({ ...x, title: `Model ${i + 1}`, subtitle: 'Marka', price: '10 TL' })) })
    expect(c).toContain('1. Model 1 – Marka (10 TL)')
    expect(c).toMatch(/#teknoloji/)
    expect(c).toMatch(/hangisini seçerdiniz/)
  })
})
