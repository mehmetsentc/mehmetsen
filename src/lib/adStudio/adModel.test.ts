import { describe, expect, it } from 'vitest'
import { duckUnderVoice, fitKey, fitTarget, AD_LOOKS, AD_LOOK_INFO, AD_VOICES, adRenderKey, adRenderProblem, adTotalMs, applyAdPatch, compileAd, defaultAd, splitScript, timeScenes, voiceHash, voicePrompt, type AdProject } from './adModel'

const OZTURK = 'Biga’dan doğan, nesilden nesile uzanan bir güven ve kalite hikâyesi… Öztürk Temper Cam, yılların tecrübesi, güçlü üretim altyapısı ve kaliteli hizmet anlayışıyla cam sektöründe sizlere hizmet vermeye devam ediyor. Dünden bugüne değişmeyen kalite anlayışımızı, gelişen teknoloji ve modern üretim teknikleriyle birleştiriyoruz. Öztürk Temper Cam! Kalitenin nesiller boyu değişmeyen adresi!'

function sample(over: Partial<AdProject> = {}): AdProject {
  const ad = defaultAd('adTEST000000', 'u1', 1000, 'firma')
  return {
    ...ad,
    media: [{ id: 'm1', kind: 'video', url: 'https://storage.googleapis.com/b/news-videos/u1/ads/adTEST000000/v.mp4', name: 'v', durationMs: 79_000, inMs: 0, outMs: 79_000 }],
    script: OZTURK,
    card: { ...ad.card, name: 'Öztürk Temper Cam', slogan: 'Kalitenin nesiller boyu değişmeyen adresi' },
    ...over,
  }
}

describe('reklam modeli', () => {
  it('derlenen projede NaHaber kapanışı yok', () => {
    const { project } = compileAd(sample())
    expect(project.closing).toBe(false)
    expect(JSON.stringify(project).toLowerCase()).not.toContain('nahaber')
  })

  it('metni okunur sahnelere böler', () => {
    const s = splitScript(OZTURK)
    expect(s[0]).toBe('Biga’dan doğan, nesilden nesile uzanan bir güven ve kalite hikâyesi…')
    expect(s.every((x) => x.length <= 75)).toBe(true)
    expect(s).toContain('Öztürk Temper Cam!')
    expect(s[s.length - 1]).toBe('Kalitenin nesiller boyu değişmeyen adresi!')
  })

  it('sahneleri süreye yayar ve kart başlamadan bitirir', () => {
    const ad = sample()
    const sc = timeScenes(splitScript(ad.script), 600, 60_000)
    expect(sc[0]!.startMs).toBe(600)
    expect(sc[sc.length - 1]!.endMs).toBeLessThanOrEqual(60_000)
    const { project, overlays } = compileAd({ ...ad, scenes: [...sc, { id: 'late', text: 'geç', startMs: 77_000, endMs: 79_000, emphasis: '' }] })
    const cardStart = adTotalMs(ad) - ad.card.durationMs
    for (const t of project.texts) if (overlays.get(t.id)?.type === 'text') expect(t.endMs).toBeLessThanOrEqual(cardStart)
    expect([...overlays.values()].some((o) => o.type === 'card')).toBe(true)
  })

  it('seslendirme güncel değilse video üretilmez', () => {
    const ad = sample()
    expect(adRenderProblem(ad)).toMatch(/Seslendirmeyi oluştur/)
    const voiced = { ...ad, voice: { url: 'https://x/v.wav', durationMs: 50_000, hash: voiceHash(ad), voice: ad.voiceId, tone: ad.tone, speed: ad.speed, chars: 1, createdAt: 1, fitKey: fitKey(ad) } }
    expect(adRenderProblem(voiced)).toBeNull()
    expect(adRenderProblem({ ...voiced, voiceId: 'selin' })).toMatch(/Seslendirmeyi oluştur/)
    expect(adRenderProblem({ ...ad, voiceOn: false })).toBeNull()
  })

  it('seslendirmesiz / yazısız seçenekler', () => {
    const ad = { ...sample({ voiceOn: false, textOn: false }), scenes: timeScenes(['A', 'B'], 0, 5000) }
    const { project, overlays } = compileAd(ad)
    expect(project.audio.some((a) => a.kind === 'voice')).toBe(false)
    expect([...overlays.values()].some((o) => o.type === 'text')).toBe(false)
    // müzik sesi seslendirme yokken daha yüksek
    expect(project.audio.find((a) => a.kind === 'music')!.volume).toBeGreaterThan(0.3)
  })

  it('video sesi: kapalı / kısık / olduğu gibi', () => {
    expect(compileAd(sample({ videoSound: 'kapali' })).project.clips[0]!.mute).toBe(true)
    expect(compileAd(sample({ videoSound: 'kisik' })).project.clips[0]!.volume).toBe(1)
    expect(duckUnderVoice(sample({ videoSound: 'kisik', voice: { url: 'x', durationMs: 1, hash: 'h', voice: 'kaan', tone: 'sakin', speed: 1, chars: 1, createdAt: 1 } }))).toBe(true)
    expect(duckUnderVoice(sample({ videoSound: 'acik' }))).toBe(false)
    expect(compileAd(sample({ videoSound: 'acik' })).project.clips[0]!.volume).toBe(1)
  })

  it('yama doğrulaması: yeni medya URL kabul edilmez, kesim sınırlanır', () => {
    const ad = sample()
    const r = applyAdPatch(ad, { media: [{ id: 'm1', inMs: 5000, outMs: 90_000 }, { id: 'yeni', url: 'https://evil/x.mp4' }], look: 'lux', textStyle: 'zarif', accent: '#123456' }, 2000)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.media).toHaveLength(1)
    expect(r.value.media[0]!.inMs).toBe(5000)
    expect(r.value.media[0]!.outMs).toBe(79_000)
    expect(r.value.media[0]!.url).toBe(ad.media[0]!.url)
    expect(applyAdPatch(ad, { look: 'yok' }, 1).ok).toBe(false)
    expect(applyAdPatch(ad, { accent: 'red' }, 1).ok).toBe(false)
  })

  it('render anahtarı içerik değişince değişir', () => {
    const ad = sample()
    expect(adRenderKey(ad)).toBe(adRenderKey({ ...ad, updatedAt: 999 }))
    expect(adRenderKey(ad)).not.toBe(adRenderKey({ ...ad, textStyle: 'bant' }))
  })

  it('her görünüm şablonu ve ses tanımlı', () => {
    for (const l of AD_LOOKS) expect(AD_LOOK_INFO[l].label).toBeTruthy()
    expect(Object.keys(AD_VOICES)).toHaveLength(4)
    expect(voicePrompt('kaan', 'etkileyici', 0.9)).toMatch(/Turkish/)
  })

  it('videonun kendi müziği varsa bizim müziğimiz eklenmez', () => {
    const own = sample({ media: [{ ...sample().media[0]!, hasAudio: true }], music: 'sinematik' })
    expect(compileAd(own).project.audio.some((a) => a.kind === 'music')).toBe(false)
    expect(compileAd({ ...own, videoSound: 'kapali' }).project.audio.some((a) => a.kind === 'music')).toBe(true)
    expect(compileAd(sample({ music: 'sinematik' })).project.audio.some((a) => a.kind === 'music')).toBe(true)
    expect(adRenderKey(own)).not.toBe(adRenderKey({ ...own, videoSound: 'kapali' }))
  })

  it('seslendirme video süresine uydurulur: hedef aralık ve süre değişince ücretsiz yeniden uydurma', () => {
    const ad = sample()
    const t = fitTarget(ad)!
    expect(t.startMs).toBe(ad.voiceStartMs)
    expect(t.endMs).toBe(79_000 - ad.card.durationMs - 800)
    const voiced = { ...ad, voice: { url: 'u', durationMs: 1, hash: voiceHash(ad), voice: ad.voiceId, tone: ad.tone, speed: ad.speed, chars: 1, createdAt: 1, fitKey: fitKey(ad) } }
    expect(adRenderProblem(voiced)).toBeNull()
    const shorter = { ...voiced, media: [{ ...voiced.media[0]!, outMs: 60_000 }] }
    expect(adRenderProblem(shorter)).toMatch(/videoya uydur/)
    expect(fitTarget({ ...ad, fitToVideo: false })).toBeNull()
  })
})
