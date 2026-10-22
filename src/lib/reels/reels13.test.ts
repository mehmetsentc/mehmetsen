import { describe, expect, it } from 'vitest'
import { buildNewsScript, directorPrompt, directReel, NEWS_SCRIPT_MAX, NEWS_SCRIPT_MIN, sentencesOf, trimToSentences } from './director'
import { captionChunks, captionWindows, MAX_REEL_S } from './renderDynamic'
import { newsBodyText } from './reelService'
import type { ReelPersona } from './personas'

const persona = { id: 'p', name: 'Ece', title: 'Gündem sunucusu', writingStyle: 'sade', voice: 'tr-TR-Chirp3-HD-Aoede', rate: 1, showCard: false } as unknown as ReelPersona

const BODY =
  'Antalya Büyükşehir Belediyesi, Konyaaltı sahilinde 3 kilometrelik yeni bisiklet yolunun açılışını yaptı. ' +
  'Proje kapsamında 1.200 ağaç dikildi ve 45 aydınlatma direği yerleştirildi. ' +
  'Belediye Başkanı yaptığı açıklamada yolun kent trafiğini rahatlatacağını söyledi. ' +
  'Bisiklet yolu sabah 6 ile gece 12 arasında kullanılabilecek. ' +
  'Çalışmaların ikinci etabının önümüzdeki yıl başlaması planlanıyor. ' +
  'Vatandaşlar açılışta yoğun ilgi gösterdi ve yolu ilk kez kullandı. ' +
  'Proje için toplam 18 milyon lira harcandığı açıklandı.'

const input = {
  title: 'Konyaaltı sahiline yeni bisiklet yolu',
  summary: 'Antalya Büyükşehir Belediyesi Konyaaltı sahilinde yeni bisiklet yolunu açtı.',
  body: BODY,
  categoryId: 'yerel',
  categoryLabel: 'Yerel',
}

describe('REELS-13 profesyonel haber anlatımı', () => {
  it('editöre haber metni ve haber spikeri yapısı gider', () => {
    const p = directorPrompt(input, persona, false)
    expect(p.user).toContain('Haber metni: Antalya Büyükşehir')
    expect(p.system).toContain('40-60 saniyelik')
    expect(p.system).toContain('5-7 cümle')
    // özet (digest) tek cümle kalır, metin gönderilmez
    expect(directorPrompt(input, persona, true).user).not.toContain('Haber metni')
  })

  it('AI metni yoksa kural metni başlık + özet + haber metninden tam cümlelerle kurulur', () => {
    const s = buildNewsScript(input.title, input.summary, BODY)
    expect(s.length).toBeGreaterThan(NEWS_SCRIPT_MIN)
    expect(s.length).toBeLessThanOrEqual(780)
    expect(s.startsWith('Konyaaltı sahiline yeni bisiklet yolu.')).toBe(true)
    // her cümle kaynakta var (uydurma yok)
    for (const sent of sentencesOf(s).slice(1)) expect(`${input.summary} ${BODY}`).toContain(sent)
  })

  it('haber metnindeki rakamlar kabul edilir; uydurma rakam reddedilir', async () => {
    const good =
      'Antalya Konyaaltı sahilinde 3 kilometrelik yeni bisiklet yolu hizmete girdi. Proje kapsamında 1.200 ağaç dikildi, 45 aydınlatma direği yerleştirildi. ' +
      'Belediye Başkanı, yolun kent trafiğini rahatlatacağını söyledi. Yol sabah 6 ile gece 12 arasında açık olacak. ' +
      'Projeye toplam 18 milyon lira harcandı. Çalışmaların ikinci etabının önümüzdeki yıl başlaması planlanıyor.'
    const r = await directReel(input, persona, async () => JSON.stringify({ style: 'haber', script: good }))
    expect(r.source).toBe('ai')
    expect(r.voiceText.length).toBeGreaterThan(NEWS_SCRIPT_MIN)
    const bad = good.replace('18 milyon', '25 milyon')
    expect((await directReel(input, persona, async () => JSON.stringify({ style: 'haber', script: bad }))).note).toBe('number_not_in_source:25')
  })

  it('uzun haberde tek cümlelik AI metni yetersiz sayılır; çok uzun metin tam cümlede kesilir', async () => {
    const short = await directReel(input, persona, async () => JSON.stringify({ style: 'haber', script: 'Konyaaltı sahiline yeni bisiklet yolu açıldı.' }))
    expect(short).toMatchObject({ source: 'rules', note: 'too_short_for_story' })
    expect(short.voiceText.length).toBeGreaterThan(NEWS_SCRIPT_MIN)
    const long = Array.from({ length: 30 }, () => 'Belediye Başkanı yaptığı açıklamada yolun kent trafiğini rahatlatacağını söyledi.').join(' ')
    expect(trimToSentences(long, NEWS_SCRIPT_MAX).length).toBeLessThanOrEqual(NEWS_SCRIPT_MAX)
    expect(trimToSentences(long, NEWS_SCRIPT_MAX).endsWith('söyledi.')).toBe(true)
  })

  it('haber metni HTML / bloklardan düz metin olarak okunur', () => {
    expect(newsBodyText({ content: '<p>Birinci paragraf.</p><h2>Ara başlık</h2><p>İkinci <b>paragraf</b>.</p>' })).toBe('Birinci paragraf. Ara başlık İkinci paragraf.')
    expect(newsBodyText({ bodyBlocks: [{ id: '1', type: 'paragraph', text: 'Blok metni.' }] })).toContain('Blok metni.')
  })

  it('altyazı: cümle cümle, uzun cümle virgülden bölünür; zamanlar seslendirmeyi kaplar', () => {
    const chunks = captionChunks(
      'Kısa bir giriş cümlesi. ' +
        'Bu cümle oldukça uzun bir cümledir, içinde birden fazla bilgi vardır ve altyazıda tek parça gösterilirse ekrana sığmayabilir, bu yüzden bölünür. Son.',
      90,
    )
    expect(chunks[0]).toBe('Kısa bir giriş cümlesi.')
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.every((c) => c.length <= 90)).toBe(true)
    const w = captionWindows(chunks, 0.45, 40)
    expect(w[0]!.start).toBeCloseTo(0.45)
    expect(w[w.length - 1]!.end).toBeCloseTo(40.45)
    for (let i = 1; i < w.length; i++) expect(w[i]!.start).toBeCloseTo(w[i - 1]!.end)
  })

  it('Reels toplam süresi Facebook sınırının altında', () => {
    expect(MAX_REEL_S).toBeLessThan(90)
  })
})

describe('REELS-13 cümle bölme', () => {
  it('sayıdaki nokta cümleyi bölmez', () => {
    expect(sentencesOf('Proje kapsamında 1.200 ağaç dikildi. Saat 19.30da açıldı.')).toEqual(['Proje kapsamında 1.200 ağaç dikildi.', 'Saat 19.30da açıldı.'])
    expect(captionChunks('Proje kapsamında 1.200 ağaç dikildi, 45 direk yerleştirildi. Son cümle.')[0]).toBe('Proje kapsamında 1.200 ağaç dikildi, 45 direk yerleştirildi.')
  })
})
