/**
 * AI Category Classifier — Son editör adımı.
 *
 * Bir haberin başlığı + içeriğine bakarak Gemini Flash'a sorar:
 * "Bu haber gerçekten hangi kategoriye ait?"
 *
 * Pipeline'daki tüm kural-tabanlı sınıflandırmadan SONRA çalışır ve
 * yüksek güvenle yanlış kategoriyi düzeltir.
 *
 * Özellikle şu hataları önler:
 * - Magazin RSS kaynağından gelen yerel/gündem haberlerin magazin'e düşmesi
 * - Spor RSS kaynağından gelen siyasi haberlerin spor'a düşmesi
 * - Kaynak adı bazlı zorunlu kategori atamasının içeriği ezmesi
 */

import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'
import {
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  YEREL_HABER_CATEGORY_ID,
} from '@/constants/config'

const YEREL_SUBCATEGORIES = getYerelSubcategories().map((c) => c.id) as readonly string[]

export type YerelSubcategory = (typeof YEREL_SUBCATEGORIES)[number]

const CATEGORIES = [
  'gundem',
  'siyaset',
  'dunya',
  'kibris-haberleri',
  'ekonomi',
  'finans-piyasa',
  'emlak-konut',
  'enerji',
  'is-kariyer',
  'spor',
  'futbol',
  'basketbol',
  'voleybol',
  'hentbol',
  'atletizm',
  'gures',
  'teknoloji',
  'oyun-espor',
  'saglik',
  'bilim',
  'egitim',
  'cevre-iklim',
  'din-inanc',
  'magazin',
  'kultur',
  'sinema',
  'tiyatro',
  'konser',
  'festival',
  'yasam',
  'astroloji',
  'moda',
  'anne-cocuk',
  'dekorasyon',
  'iliskiler',
  'gastronomi',
  'otomobil',
  'tarih',
  'yerel-haber',
] as const

export type NewsCategory = (typeof CATEGORIES)[number]

const CATEGORY_DESCRIPTIONS: Record<NewsCategory, string> = {
  gundem:        'Türkiye genelini veya birden fazla ili etkileyen genel gündem. Eğitim/çevre/moda için özel kategorileri tercih et. Tek il/ilçe haberleri → yerel-haber.',
  siyaset:       'Siyasi partiler, seçimler, meclis, hükümet, cumhurbaşkanı, CHP, AKP, MHP politikası',
  dunya:         'Uluslararası haberler, yabancı ülkeler, savaş, diplomasi, NATO, AB, BM (KKTC haberleri için kullanma)',
  'kibris-haberleri': 'Kuzey Kıbrıs Türk Cumhuriyeti (KKTC): Lefkoşa, Gazimağusa, Girne, KKTC siyaseti, cumhurbaşkanı, meclis, kuzey kıbrıs yerel haberleri. Güney Kıbrıs/Yunan haberleri değil.',
  ekonomi:       'Genel ekonomi: şirket, ticaret, makroekonomi (alt dal belli değilse)',
  'finans-piyasa': 'Borsa, döviz, faiz, TCMB, hisse, yatırım, menkul kıymet',
  'emlak-konut': 'Konut, emlak, kira, mortgage, gayrimenkul, TOKİ',
  enerji:        'Petrol, doğalgaz, elektrik, enerji politikası, yenilenebilir enerji piyasası',
  'is-kariyer':  'İşsizlik, istihdam, kariyer, iş ilanı, çalışma hayatı, SGK (ücret politikası hariç genel)',
  spor:          'Genel spor haberleri (hangi branş olduğu belli değilse), olimpiyat açılış/kapanış',
  futbol:        'SADECE futbol: top, gol, penaltı, offside, Süper Lig, Şampiyonlar Ligi, FIFA, UEFA, futbol transferi. Basketbol/voleybol haberleri için ASLA kullanma.',
  basketbol:     'SADECE basketbol: NBA, EuroLeague, BSL (Basketbol Süper Ligi), FIBA, Fenerbahçe Beko, Anadolu Efes, Galatasaray Nef, basketbol maçı/transfer/antrenman. Futbol ile karıştırma.',
  voleybol:      'SADECE voleybol: CEV, FIVB, Sultanlar Ligi, Efeler Ligi, milli voleybol takımı, voleybol maçı/transfer. Futbol ile karıştırma.',
  hentbol:       'Hentbol haberleri, EHF, Türkiye hentbol ligi',
  atletizm:      'Atletizm, koşu, maraton, olimpiyat atletizm, dünya şampiyonası',
  gures:         'Güreş haberleri, wrestling, dünya güreş şampiyonası',
  teknoloji:     'Teknoloji, yapay zeka, yazılım, internet, telefon, bilgisayar, donanım (oyun/espor değil)',
  'oyun-espor':  'Video oyunları, konsol, espor, Twitch, Steam, oyun turnuvaları',
  saglik:        'Sağlık, hastalık, ilaç, hastane, tıp, pandemi, beslenme, diyet',
  bilim:         'Bilim, uzay, NASA, araştırma, keşif, fizik, kimya (iklim politikası → cevre-iklim)',
  egitim:        'Okul, üniversite, YKS, LGS, MEB, öğretmen, eğitim politikası',
  'cevre-iklim': 'İklim değişikliği, çevre kirliliği, orman yangını (ekolojik boyut), sera gazı, sürdürülebilirlik',
  'din-inanc':   'Din, diyanet, ibadet, bayram dinî boyut, inanç haberleri',
  magazin:       'Ünlülerin özel hayatı, skandal, dedikodu (moda/ilişki rehberi değil)',
  kultur:        'Genel kültür-sanat, müze, edebiyat, kitap, mimari, gelenek (branş belli değilse)',
  sinema:        'Sinema filmleri, vizyon, oyuncu/yönetmen haberleri, film ödülleri (Oscar vb.)',
  tiyatro:       'Tiyatro oyunları, sahne, piyes, opera, bale haberleri',
  konser:        'Konser, müzik etkinlikleri, turne, albüm çıkışları, müzik festivallerine katılım',
  festival:      'Kültür/sanat festivalleri, film festivali (Cannes, Berlin, İstanbul Film Festivali)',
  yasam:         'Genel yaşam tarzı — alt dal belli değilse. Burç/astroloji içerikleri için ASLA kullanma → astroloji.',
  astroloji:     'Burç yorumu, günlük/haftalık burç, zodyak, yükselen, gezegen retrosu, astroloji rehberi. Koç/Boğa/İkizler/Yengeç/Aslan/Başak/Terazi/Akrep/Yay/Oğlak/Kova/Balık burcu yazıları. ASLA yasam değil.',
  moda:          'Moda, giyim, defile, stil, güzellik ürünü (ünlü skandalı değil)',
  'anne-cocuk':  'Ebeveynlik, çocuk bakımı, hamilelik, okul öncesi',
  dekorasyon:    'Ev dekorasyonu, iç mimari, mobilya',
  iliskiler:     'İlişki tavsiyeleri, evlilik rehberi (ünlü dedikodusu → magazin; burç ilişki yorumu → astroloji)',
  gastronomi:    'Yemek, tarif, restoran haberleri, şef, Michelin yıldızı, mutfak kültürü, foodie',
  otomobil:      'Araba, araç, otomobil, motosiklet, trafik, elektrikli araç, TOGG, yeni model tanıtımı',
  tarih:         'Tarih, arkeoloji, tarihi yıldönümü, Osmanlı/Cumhuriyet tarihi',
  'yerel-haber': 'Yalnızca TÜRKİYE\'deki tek bir il/ilçeyi kapsayan yerel olay. Tercihen doğrudan yerel-* alt kategori kullan (yerel-emlak, yerel-saglik, yerel-cevre-iklim, yerel-gundem…). YURT DIŞI ve KKTC için ASLA kullanma.',
}

export interface ClassifierResult {
  categoryId: NewsCategory
  confidence: number  // 0-100
  reason: string
}

/**
 * Fast Gemini Flash call — classifies a single article.
 * Returns null if AI is unavailable or uncertain (< 75 confidence).
 */
export async function classifyArticleCategory(
  title: string,
  content: string,
  currentCategory: string,
): Promise<ClassifierResult | null> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!deepseekKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'

  const categoryList = CATEGORIES.map(
    c => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`
  ).join('\n')

  const prompt = `Sen deneyimli bir Türk haber editörüsün. Aşağıdaki haberin başlığını ve içeriğini okuyarak EN DOĞRU kategoriyi seç.

BAŞLIK: ${title}
İÇERİK (ilk 300 kelime): ${content.slice(0, 1500)}

MEVCUT KATEGORİ (önceki sistem tarafından atandı, yanlış olabilir): ${currentCategory}

KATEGORİ SEÇENEKLERİ:
${categoryList}

TEMEL KURALLAR (hepsini uygula):
1. KAYNAK ADINI VE KAYNAK GAZETENİN ŞEHRİNİ GÖRMEZDEN GEL — "Bursa Gazetesi", "Milliyet Magazin", "Sabah Spor" gibi kaynak isimleri kategoriye etki ETMEMELİ. Haberin GERÇEK coğrafyası ve içeriği her şeyi belirler.
2. YURT DIŞI HABER ALTIN KURALI — Olay İngiltere, ABD, Almanya, Fransa, Gazze, Ukrayna veya Türkiye DIŞINDA herhangi bir yerde geçiyorsa → KESİNLİKLE "dunya". Kaynak gazete Bursa'dan çıksa bile, haber İngiltere'deki bir olaysa → "dunya". Asla "yerel-haber" değil.
3. YEREL vs ULUSAL (konu şehri EZMESİN):
   - Başlıkta tek şehir ("Van'da", "Yalova'da") + yerel kapsam → "yerel-haber" (pipeline yerel-emlak/yerel-saglik/yerel-cevre-iklim'e map eder). ASLA doğrudan emlak-konut/saglik/cevre-iklim seçme.
   - "Van'da konut satışları" → yerel-haber (emlak-konut DEĞİL). "Van Gölü atık toplama" → yerel-haber. "Yalova sağlık etkinliği" → yerel-haber.
   - Türkiye geneli / bakanlık / TCMB / çok şehir / ulusal politika → ulusal kategori; şehir yalnızca konumsa city olarak kalabilir.
4. yerel-haber → SADECE olayın geçtiği yer Türkiye'deki tek bir il/ilçe ise. "Bursa Gazetesi İngiltere'deki haberi yazdı" → dunya.
5. Siyasi/meclis/seçim/hükümet içeriği → mutlaka "siyaset" (kaynak spor gazetesi bile olsa)
6. Ekonomi/borsa/döviz/şirket haberi → mutlaka "ekonomi" — AMA tek şehir istatistiği/yerel işletme ise → yerel-haber
7. SPOR BRANŞI AYIRT ETME — KESİNLİKLE karıştırma:
   - Basketbol, NBA, EuroLeague, BSL, Fenerbahçe Beko, Anadolu Efes, Galatasaray Nef → "basketbol" (ASLA "futbol" değil)
   - Voleybol, Sultanlar Ligi, Efeler Ligi, CEV, FIVB, milli voleybol → "voleybol" (ASLA "futbol" değil)
   - Futbol, Süper Lig, Şampiyonlar Ligi, FIFA, UEFA, top/gol/penaltı → "futbol" (ASLA "basketbol" veya "voleybol" değil)
   - Kulüp adı (Fenerbahçe, Galatasaray, Beşiktaş) branşı belirlemez — metnin SPOR BRANŞINA bak
   - "Fenerbahçe Beko şampiyon" → basketbol. "Fenerbahçe 3-1 Galatasaray" → futbol.
8. Yemek/restoran/şef/tarif haberi → "gastronomi" — tek ilçe yöresel lezzet → yerel-haber
9. Araba/otomobil/araç/TOGG/elektrikli araç → "otomobil"
10. Sinema filmi/vizyona girenler → "sinema", tiyatro oyunu → "tiyatro", konser haberi → "konser"
11. Magazin = SADECE ünlülerin kişisel hayatı, ilişkisi, skandalı, dedikodu
12. ASTROLOJİ / BURÇ — KESİN:
   - Günlük/haftalık burç yorumu, burç adı (Yay, Koç, …), yükselen, retrosu, zodyak → "astroloji"
   - Bu içerikler için ASLA "yasam" veya "iliskiler" seçme
13. Mevcut kategori doğruysa onayla, yanlışsa düzelt

JSON formatında yanıt ver:
{"categoryId": "kategori-adı", "confidence": 85, "reason": "kısa açıklama"}`

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'Sen bir Türk haber kategorileme uzmanısın. Yalnızca JSON döndür.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return null

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null

    const parsed = JSON.parse(raw) as { categoryId?: string; confidence?: number; reason?: string }
    const categoryId = parsed.categoryId?.trim() as NewsCategory
    const confidence = Number(parsed.confidence ?? 0)

    if (!CATEGORIES.includes(categoryId) || confidence < 75) return null

    const resolvedId = applyAstrologyCategoryOverride(
      categoryId,
      title,
      content
    ) as NewsCategory

    return {
      categoryId: resolvedId,
      confidence,
      reason:
        resolvedId !== categoryId
          ? `${parsed.reason ?? ''} [override→astroloji]`.trim()
          : parsed.reason ?? '',
    }
  } catch {
    return null
  }
}

export interface YerelClassifierResult {
  categoryId: YerelSubcategory
  confidence: number
  reason: string
}

/**
 * Classify a local news article into a specific yerel subcategory.
 * Called when the national classifier returns yerel-haber without a subcategory.
 */
export async function classifyYerelSubcategory(
  title: string,
  content: string,
): Promise<YerelClassifierResult | null> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!deepseekKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  const yerelCats = getYerelSubcategories()
  const categoryList = yerelCats
    .map((c) => `  - ${c.id}: ${getYerelSubcategoryShortLabel(c)}`)
    .join('\n')

  const prompt = `Sen deneyimli bir Türk yerel haber editörüsün. Aşağıdaki TEK BİR il/ilçeyi kapsayan yerel haber için EN UYGUN yerel alt kategoriyi seç.

BAŞLIK: ${title}
İÇERİK (ilk 300 kelime): ${content.slice(0, 1500)}

YEREL ALT KATEGORİ SEÇENEKLERİ:
${categoryList}

KURALLAR:
- Yalnızca yukarıdaki yerel-* id'lerinden birini seç.
- ${YEREL_HABER_CATEGORY_ID} kullanma — mutlaka en uygun alt kategoriyi seç.
- Belediye/siyaset → yerel-siyaset. Kaza/suç/operasyon → yerel-asayis. Yerel/amatör spor kulübü → branşa göre yerel-futbol/yerel-basketbol/yerel-voleybol/yerel-tenis/…; branş belirsizse yerel-spor.
- Süper Lig / Trendyol 1. Lig kulüpleri (Galatasaray, Fenerbahçe, Beşiktaş, …) → yerel-spor DEĞİL; pipeline ulusal futbol'a yönlendirir.
- Okul/üniversite → yerel-egitim. Hastane/sağlık/yerel sağlık etkinliği → yerel-saglik.
- Tek şehir konut/emlak/kira/satış istatistiği → yerel-emlak (ulusal emlak-konut DEĞİL).
- Tek şehir/göl çevre temizliği, yerel atık, yerel kirlilik → yerel-cevre-iklim.
- Etkinlik/festival → yerel-etkinlik veya yerel-festival. Yöresel yemek → yerel-gastronomi.
- Belediye/kaymakamlık duyurusu, resmi ilan, askıya alma, su/elektrik kesintisi duyurusu → yerel-duyuru (siyaset kararı değilse).

JSON formatında yanıt ver:
{"categoryId": "yerel-xxx", "confidence": 85, "reason": "kısa açıklama"}`

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'Sen bir Türk yerel haber kategorileme uzmanısın. Yalnızca JSON döndür.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return null

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null

    const parsed = JSON.parse(raw) as { categoryId?: string; confidence?: number; reason?: string }
    const categoryId = parsed.categoryId?.trim() ?? ''
    const confidence = Number(parsed.confidence ?? 0)

    if (!YEREL_SUBCATEGORIES.includes(categoryId) || confidence < 70) return null

    return {
      categoryId: categoryId as YerelSubcategory,
      confidence,
      reason: parsed.reason ?? '',
    }
  } catch {
    return null
  }
}
