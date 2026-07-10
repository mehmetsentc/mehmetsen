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

const CATEGORIES = [
  'gundem',
  'siyaset',
  'dunya',
  'kibris-haberleri',
  'ekonomi',
  'spor',
  'futbol',
  'basketbol',
  'voleybol',
  'hentbol',
  'atletizm',
  'gures',
  'teknoloji',
  'saglik',
  'bilim',
  'magazin',
  'kultur',
  'sinema',
  'tiyatro',
  'konser',
  'festival',
  'gastronomi',
  'otomobil',
  'yerel-haber',
] as const

export type NewsCategory = (typeof CATEGORIES)[number]

const CATEGORY_DESCRIPTIONS: Record<NewsCategory, string> = {
  gundem:        'Türkiye genelini veya birden fazla ili etkileyen genel gündem, sosyal, turizm, çevre haberleri. Tek bir ile/ilçeye ait belediye kararı veya yerel yönetim haberleri için ASLA kullanma — o tür haberler yerel-haber kategorisine girer.',
  siyaset:       'Siyasi partiler, seçimler, meclis, hükümet, cumhurbaşkanı, CHP, AKP, MHP politikası',
  dunya:         'Uluslararası haberler, yabancı ülkeler, savaş, diplomasi, NATO, AB, BM (KKTC haberleri için kullanma)',
  'kibris-haberleri': 'Kuzey Kıbrıs Türk Cumhuriyeti (KKTC): Lefkoşa, Gazimağusa, Girne, KKTC siyaseti, cumhurbaşkanı, meclis, kuzey kıbrıs yerel haberleri. Güney Kıbrıs/Yunan haberleri değil.',
  ekonomi:       'Ekonomi, borsa, döviz, faiz, enflasyon, şirket, finans, kripto para',
  spor:          'Genel spor haberleri (hangi branş olduğu belli değilse), olimpiyat açılış/kapanış',
  futbol:        'SADECE futbol: top, gol, penaltı, offside, Süper Lig, Şampiyonlar Ligi, FIFA, UEFA, futbol transferi. Basketbol/voleybol haberleri için ASLA kullanma.',
  basketbol:     'SADECE basketbol: NBA, EuroLeague, BSL (Basketbol Süper Ligi), FIBA, Fenerbahçe Beko, Anadolu Efes, Galatasaray Nef, basketbol maçı/transfer/antrenman. Futbol ile karıştırma.',
  voleybol:      'SADECE voleybol: CEV, FIVB, Sultanlar Ligi, Efeler Ligi, milli voleybol takımı, voleybol maçı/transfer. Futbol ile karıştırma.',
  hentbol:       'Hentbol haberleri, EHF, Türkiye hentbol ligi',
  atletizm:      'Atletizm, koşu, maraton, olimpiyat atletizm, dünya şampiyonası',
  gures:         'Güreş haberleri, wrestling, dünya güreş şampiyonası',
  teknoloji:     'Teknoloji, yapay zeka, yazılım, internet, telefon, bilgisayar, donanım',
  saglik:        'Sağlık, hastalık, ilaç, hastane, tıp, pandemi, beslenme, diyet',
  bilim:         'Bilim, uzay, NASA, araştırma, keşif, iklim, çevre bilimi, fizik, kimya',
  magazin:       'Ünlüler, dizi/film oyuncuları, müzik yıldızları, moda, ilişki, skandal, dedikodu',
  kultur:        'Genel kültür-sanat, müze, edebiyat, kitap, mimari, gelenek (branş belli değilse)',
  sinema:        'Sinema filmleri, vizyon, oyuncu/yönetmen haberleri, film ödülleri (Oscar vb.)',
  tiyatro:       'Tiyatro oyunları, sahne, piyes, opera, bale haberleri',
  konser:        'Konser, müzik etkinlikleri, turne, albüm çıkışları, müzik festivallerine katılım',
  festival:      'Kültür/sanat festivalleri, film festivali (Cannes, Berlin, İstanbul Film Festivali)',
  gastronomi:    'Yemek, tarif, restoran haberleri, şef, Michelin yıldızı, mutfak kültürü, foodie',
  otomobil:      'Araba, araç, otomobil, motosiklet, trafik, elektrikli araç, TOGG, yeni model tanıtımı',
  'yerel-haber': 'Yalnızca TÜRKİYE\'deki tek bir il/ilçeyi kapsayan yerel olay: belediye kararı, belediye başkanı açıklaması, zabıta uygulaması, yerel kaza, yerel yangın, ilçe etkinliği, karne töreni, mahalle haberi. YURT DIŞI ve KKTC haberleri için ASLA kullanma.',
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

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'

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
3. yerel-haber → SADECE olayın geçtiği yer Türkiye'deki tek bir il/ilçe ise. "Bursa Gazetesi İngiltere'deki haberi yazdı" → dunya.
4. Siyasi/meclis/seçim/hükümet içeriği → mutlaka "siyaset" (kaynak spor gazetesi bile olsa)
5. Ekonomi/borsa/döviz/şirket haberi → mutlaka "ekonomi"
6. SPOR BRANŞI AYIRT ETME — KESİNLİKLE karıştırma:
   - Basketbol, NBA, EuroLeague, BSL, Fenerbahçe Beko, Anadolu Efes, Galatasaray Nef → "basketbol" (ASLA "futbol" değil)
   - Voleybol, Sultanlar Ligi, Efeler Ligi, CEV, FIVB, milli voleybol → "voleybol" (ASLA "futbol" değil)
   - Futbol, Süper Lig, Şampiyonlar Ligi, FIFA, UEFA, top/gol/penaltı → "futbol" (ASLA "basketbol" veya "voleybol" değil)
   - Kulüp adı (Fenerbahçe, Galatasaray, Beşiktaş) branşı belirlemez — metnin SPOR BRANŞINA bak
   - "Fenerbahçe Beko şampiyon" → basketbol. "Fenerbahçe 3-1 Galatasaray" → futbol.
7. Yemek/restoran/şef/tarif haberi → "gastronomi"
8. Araba/otomobil/araç/TOGG/elektrikli araç → "otomobil"
9. Sinema filmi/vizyona girenler → "sinema", tiyatro oyunu → "tiyatro", konser haberi → "konser"
10. Magazin = SADECE ünlülerin kişisel hayatı, ilişkisi, skandalı, dedikodu
11. Mevcut kategori doğruysa onayla, yanlışsa düzelt

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

    return { categoryId, confidence, reason: parsed.reason ?? '' }
  } catch {
    return null
  }
}
