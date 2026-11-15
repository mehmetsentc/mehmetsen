import { describe, expect, it } from 'vitest'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { parseListingPage } from '../discovery/listing'
import { extractArticle } from '../extract/pipeline'
import { pickFairPending } from '../scheduler'
import type { DiscoveredUrlRecord, NewsSourceRecord } from '../types'
import { resolveRawArticleGeo } from './geo'
import { parseSondakikaDateTime, parseSondakikaListing, upscaleSondakikaImage } from './listing'
import { locateSondakikaArticle } from './locate'
import {
  isSondakikaCitySource,
  sondakikaCitySourceInputs,
  SONDAKIKA_CITY_PRIORITY,
  SONDAKIKA_DOMAIN,
} from './registry'

// Gerçek sondakika.com/adana/ yapısından kırpıldı (15.11.2026).
const ADANA_LISTING = `
<html><body>
<nav><a href="/antalya/">Antalya</a><a href="/yerel-haberler/">Yerel</a><a href="/kunye/">Künye</a></nav>
<h1 class="title">Son Dakika Adana Haberleri</h1>
<div id="sliderWrapper"><div class="new3slider">
  <div class="new3slide" id="manset1"><a title="Adana'da festival başladı" href="/guncel/haber-adana-da-festival-basladi-20430001/">
    <img src="https://foto.sondakika.com/crop/740x493/webp/haber/2026/11/15/adana-festival_sd.jpg" alt="x" /><h2>Adana'da festival başladı</h2></a></div>
  <div class="new3slide" id="manset2"><a title="Osmaniye'de TIR ile 3 otomobil peş peşe çarpıştı" href="/3-sayfa/haber-osmaniye-de-tir-ile-3-otomobil-20430002/"><img src="https://foto.sondakika.com/crop/740x493/webp/haber/2026/11/15/osm_sd.jpg" /></a></div>
</div></div>
<ul>
  <li class="nws w-100"><a href="/3-sayfa/haber-osmaniye-de-tir-ile-3-otomobil-20430002/" class=""><div class="img-wrapper"><img width="380" height="213" src="https://foto.sondakika.com/crop/380x213/webp/haber/2026/11/15/osm_sd.jpg" /></div></a>
    <div class="nws-txt"><span class="news-time-dark" title="15.11.2026 21:58:00"><span class="mdate">21:58</span></span>
    <a href="/3-sayfa/haber-osmaniye-de-tir-ile-3-otomobil-20430002/" class="content" title="Osmaniye'de TIR ile 3 otomobil peş peşe çarpıştı"><span class="title">Osmaniye'de TIR ile 3 otomobil peş peşe çarpıştı</span></a>
    <p class="news-detail news-column"><a href="/3-sayfa/haber-osmaniye-de-tir-ile-3-otomobil-20430002/">Osmaniye'nin Düziçi ilçesinde zincirleme kaza: 7 yaralı.</a></p></div></li>
  <li class="nws w-100"><a href="/spor/haber-adanaspor-evinde-kazandi-20430003/"><img src="https://foto.sondakika.com/crop/380x213/webp/haber/2026/11/15/as_sd.jpg" /></a>
    <div class="nws-txt"><span class="news-time-dark" title="15.11.2026 20:10:00"><span class="mdate">20:10</span></span>
    <a href="/spor/haber-adanaspor-evinde-kazandi-20430003/" class="content" title="Adanaspor evinde kazandı"><span class="title">Adanaspor evinde kazandı</span></a></div></li>
</ul>
<a href="/etiket/kaza/">kaza</a>
</body></html>`

// Gerçek bir detay sayfasından kırpıldı: JSON-LD + üst kalıntılar + .haber_metni
const ARTICLE_HTML = `
<html><head><title>x</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsArticle",
"headline":"Alanya'da jandarmanın ev aramasında 3 kilo 340 gram esrar ele geçirildi",
"description":"Alanya Cumhuriyet Başsavcılığının talimatları doğrultusunda operasyon düzenlendi.",
"datePublished":"2026-11-15T20:51:54+03:00","dateModified":"2026-11-15T20:52:00+03:00",
"image":{"@type":"ImageObject","contentUrl":"https://foto.sondakika.com/crop/1210x0/haber/2026/11/15/x_sd.jpg"},
"author":{"@type":"Organization","name":"İHA"}}]}</script></head><body>
<div class="promo">Google algoritmasına bırakmayın, okuyacağınız haberi siz seçin! Tıkla ve ekle</div>
<div>Abone ol</div><div>Yorum yap</div>
<h1>Alanya'da jandarmanın ev aramasında 3 kilo 340 gram esrar ele geçirildi</h1>
<div class="wrapper detay-v3_3 haber_metni"><p><a class='keyword-sd' href='/antalya/'>Antalya</a>'nın <a class='keyword-sd' href='/alanya/'>Alanya</a> ilçesinde jandarma ekipleri tarafından bir evde yapılan aramada 3 kilo 340 gram esrar ele geçirildi.</p><p>Alanya Cumhuriyet Başsavcılığının talimatları doğrultusunda Antalya İl Jandarma Komutanlığınca uyuşturucu madde ile mücadeleye yönelik operasyon gerçekleştirildi. Jandarma ekipleri olayla ilgili adli işlem başlattı.</p><p id="tb-inpage-general" class="d-none"></p></div>
<div class="haberkaynak">Kaynak:&nbsp;İHA</div>
<div class="lnkSeo"><div class="news-tags"><a href="/yerel-haberler/">Yerel Haberler</a></div></div>
</body></html>`

describe('SONDAKIKA-81 liste ayrıştırma', () => {
  const pageUrl = 'https://www.sondakika.com/adana/'

  it('yalnız haber kartlarını alır; menü/etiket linklerini almaz', () => {
    const items = parseListingPage(ADANA_LISTING, pageUrl)
    expect(items.map((i) => i.url).sort()).toEqual(
      [
        // Ortak normalleştirici sondaki '/' işaretini siler; site 301 ile doğru adrese yönlendirir.
        'https://www.sondakika.com/3-sayfa/haber-osmaniye-de-tir-ile-3-otomobil-20430002',
        'https://www.sondakika.com/guncel/haber-adana-da-festival-basladi-20430001',
        'https://www.sondakika.com/spor/haber-adanaspor-evinde-kazandi-20430003',
      ].sort()
    )
  })

  it('liste kartından saat, başlık, özet ve büyük görsel; slider öğesi saatsiz', () => {
    const items = parseSondakikaListing(ADANA_LISTING, pageUrl)
    const osm = items.find((i) => i.url.includes('20430002'))!
    expect(osm.title).toBe("Osmaniye'de TIR ile 3 otomobil peş peşe çarpıştı")
    expect(osm.description).toContain('Düziçi')
    expect(osm.publishedAt?.toISOString()).toBe('2026-11-15T18:58:00.000Z')
    expect(osm.imageUrl).toBe('https://foto.sondakika.com/crop/1210x0/haber/2026/11/15/osm_sd.jpg')
    const slider = items.find((i) => i.url.includes('20430001'))!
    expect(slider.publishedAt).toBeNull()
  })

  it('başka sitelerin liste ayrıştırması değişmez', () => {
    const html = '<a href="https://example.com/2026/11/15/bir-haber-basligi">x</a>'
    expect(parseListingPage(html, 'https://example.com/')).toHaveLength(1)
  })

  it('yardımcılar', () => {
    expect(parseSondakikaDateTime('15.11.2026 20:52:00')?.toISOString()).toBe('2026-11-15T17:52:00.000Z')
    expect(parseSondakikaDateTime('bugün')).toBeNull()
    expect(upscaleSondakikaImage('https://foto.sondakika.com/crop/380x213/webp/haber/a_sd.jpg')).toBe(
      'https://foto.sondakika.com/crop/1210x0/haber/a_sd.jpg'
    )
  })
})

describe('SONDAKIKA-81 detay çıkarma (domain kuralı)', () => {
  it('gövde yalnız .haber_metni; üst kalıntılar karışmaz', () => {
    const e = extractArticle(
      ARTICLE_HTML,
      'https://www.sondakika.com/3-sayfa/haber-alanya-da-jandarmanin-ev-aramasinda-3-kilo-340-gra-20430348/',
      'tr'
    )
    expect(e.extractionMethod).toBe('domain-rule')
    expect(e.articleBodyText).toContain('3 kilo 340 gram esrar')
    expect(e.articleBodyText).not.toMatch(/Google algoritmas|Abone ol|Yorum yap|Kaynak:|Yerel Haberler/)
  })
})

describe('SONDAKIKA-81 il/ilçe tespiti', () => {
  it('başlıkta ilk geçen il kazanır (Adana sayfasındaki Osmaniye haberi)', () => {
    const r = locateSondakikaArticle({
      title: "Osmaniye'de TIR ile 3 otomobil peş peşe çarpıştı, 7 kişi yaralandı",
      body: "Osmaniye'nin Düziçi ilçesinde ... yaralılar Adana'daki hastaneye sevk edildi.",
    })
    expect(r.provinceSlug).toBe('osmaniye')
    expect(r.districtName).toBe('Düziçi')
    expect(r.confidence).toBe('high')
  })

  it('yalnız ilçe geçiyor → ilçeden il', () => {
    const r = locateSondakikaArticle({ title: "Nazilli'de uyuşturucu operasyonu: 2 tutuklama" })
    expect(r.provinceSlug).toBe('aydin')
    expect(r.districtName).toBe('Nazilli')
  })

  it('çok illi ilçe (Kemer) il geçmeden kullanılmaz', () => {
    expect(locateSondakikaArticle({ title: "Kemer'de sezon uzadı" }).provinceSlug).toBeNull()
    const r = locateSondakikaArticle({ title: "Kemer'de sezon uzadı", body: "Antalya'nın Kemer ilçesinde" })
    expect(r.provinceSlug).toBe('antalya')
    expect(r.districtName).toBe('Kemer')
  })

  it('sıradan kelimeyle çakışan ilçe tek başına il sayılmaz (gerçek hatalar)', () => {
    expect(locateSondakikaArticle({ title: "Öğretmen adayları Ulus Meydanı'nda" }).provinceSlug).not.toBe('bartin')
    expect(locateSondakikaArticle({ title: "Hülya Koçyiğit, Susuz Yaz'ın yeni Bahar'ına seslendi" }).provinceSlug).not.toBe('kars')
    const ok = locateSondakikaArticle({ title: "Bartın Ulus'ta sel" })
    expect(ok.provinceSlug).toBe('bartin')
    expect(ok.districtName).toBe('Ulus')
  })

  it('"{İl} Üniversitesi" kurum adı konum sayılmaz (gerçek veri)', () => {
    const r = locateSondakikaArticle({
      title: "Sakarya Üniversitesi COP31'de 45 projeyle çalışmalarını dünyaya tanıttı",
      body: "Antalya'da düzenlenen COP31'de Sakarya Üniversitesi standı ilgi gördü.",
    })
    expect(r.provinceSlug).toBe('antalya')
    expect(locateSondakikaArticle({ title: "Sakarya'da sel" }).provinceSlug).toBe('sakarya')
  })

  it('küçük harfli ortak kelime il sayılmaz', () => {
    expect(locateSondakikaArticle({ title: 'Bel ağrısı olanlara uyarı', body: 'ordu birlikleri' }).provinceSlug).toBeNull()
  })

  it('çok ilde geçen haber ulusal', () => {
    const r = locateSondakikaArticle({
      title: "Meteoroloji'den 5 il için sarı kodlu uyarı",
      description: 'Rize, Artvin, Trabzon, Giresun ve Ordu için kuvvetli yağış uyarısı yapıldı.',
      body: "Rize'de, Artvin'de, Trabzon'da, Giresun'da ve Ordu'da sağanak. Rize, Artvin, Trabzon, Giresun, Ordu.",
    })
    expect(r.likelyNational).toBe(true)
  })
})

function source(partial: Partial<NewsSourceRecord>): NewsSourceRecord {
  return {
    id: 's',
    domain: 'example.com',
    registryKey: null,
    region: null,
    city: null,
    district: null,
    priority: 50,
    crawlPriority: 'NORMAL',
    ...partial,
  } as NewsSourceRecord
}

describe('SONDAKIKA-81 ham haber il/ilçe ataması', () => {
  const adanaPage = source({
    domain: SONDAKIKA_DOMAIN,
    registryKey: 'sondakika-il-adana',
    region: 'Akdeniz',
    city: 'Adana',
  })

  it('il sayfasının ili değil, haberin ili yazılır', () => {
    const g = resolveRawArticleGeo(adanaPage, {
      title: "Osmaniye'de TIR ile 3 otomobil çarpıştı",
      description: null,
      articleBodyText: "Osmaniye'nin Düziçi ilçesinde",
    })
    expect(g).toEqual({ region: 'Akdeniz', city: 'Osmaniye', district: 'Düziçi' })
  })

  it('il bulunamazsa il sayfasının iline yazılmaz', () => {
    const g = resolveRawArticleGeo(adanaPage, { title: 'Altın fiyatları yükseldi', description: null, articleBodyText: '' })
    expect(g).toEqual({ region: null, city: null, district: null })
  })

  it('diğer kaynaklarda (ulusal sondakika RSS dahil) davranış aynı', () => {
    const local = source({ domain: 'canakkaleolay.com', registryKey: 'canakkaleolay', region: 'Marmara', city: 'Çanakkale' })
    expect(resolveRawArticleGeo(local, { title: "Osmaniye'de kaza", description: null, articleBodyText: '' })).toEqual({
      region: 'Marmara',
      city: 'Çanakkale',
      district: null,
    })
    const national = source({ domain: SONDAKIKA_DOMAIN, registryKey: 'sondakika' })
    expect(isSondakikaCitySource(national)).toBe(false)
  })
})

describe('SONDAKIKA-81 kaynak kaydı', () => {
  it('81 il, benzersiz anahtar, LISTING, düşük öncelik', () => {
    const inputs = sondakikaCitySourceInputs('ACTIVE')
    expect(inputs).toHaveLength(81)
    expect(new Set(inputs.map((i) => i.registryKey)).size).toBe(81)
    expect(inputs.every((i) => i.discoveryMethod === 'LISTING' && i.listingUrls?.length === 1)).toBe(true)
    expect(inputs.every((i) => i.priority === SONDAKIKA_CITY_PRIORITY && i.status === 'ACTIVE')).toBe(true)
    expect(inputs.map((i) => i.city).sort()).toEqual(TURKISH_PROVINCES.map((p) => p.name).sort())
    expect(inputs.find((i) => i.registryKey === 'sondakika-il-kahramanmaras')?.listingUrls).toEqual([
      'https://www.sondakika.com/kahramanmaras/',
    ])
    expect(sondakikaCitySourceInputs()[0].status).toBe('PAUSED')
    expect(SONDAKIKA_CITY_PRIORITY).toBe(50) // 30 bandı canlıda sıra bulamıyor
    expect(inputs.every((i) => i.crawlIntervalSeconds === 6 * 60 * 60)).toBe(true)
  })
})

describe('SONDAKIKA-81 domain kotası', () => {
  it('81 sondakika kaynağı turun tamamını almaz; diğer kaynaklar yerini korur', () => {
    const sources = new Map<string, NewsSourceRecord>()
    const pending: DiscoveredUrlRecord[] = []
    const now = Date.now()
    const addSource = (id: string, domain: string, n: number) => {
      sources.set(id, source({ id, domain, priority: domain === SONDAKIKA_DOMAIN ? 30 : 50, crawlPriority: domain === SONDAKIKA_DOMAIN ? 'LOW' : 'NORMAL' }))
      for (let i = 0; i < n; i++) {
        pending.push({ id: `${id}-${i}`, sourceId: id, discoveredAt: new Date(now - i * 1000) } as DiscoveredUrlRecord)
      }
    }
    for (const p of TURKISH_PROVINCES) addSource(`sd-${p.slug}`, SONDAKIKA_DOMAIN, 6)
    for (let i = 0; i < 10; i++) addSource(`other-${i}`, `site${i}.com`, 6)

    const picked = pickFairPending({
      pending,
      sources,
      limit: 80,
      maxPerSource: 4,
      maxPerDomain: new Map([[SONDAKIKA_DOMAIN, 20]]),
    })
    const sd = picked.filter((p) => p.sourceId.startsWith('sd-')).length
    const others = picked.length - sd
    expect(sd).toBe(20)
    expect(others).toBe(40) // 10 kaynak × 4 — kota olmadan sondakika bunları da sıkıştırırdı

    const uncapped = pickFairPending({ pending, sources, limit: 80, maxPerSource: 4 })
    expect(uncapped.filter((p) => p.sourceId.startsWith('sd-')).length).toBeGreaterThan(20)
  })
})
