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
  gundem:        'Genel gündem, sosyal, turizm, çevre, belediye, yerel yönetim haberleri',
  siyaset:       'Siyasi partiler, seçimler, meclis, hükümet, cumhurbaşkanı, CHP, AKP, MHP politikası',
  dunya:         'Uluslararası haberler, yabancı ülkeler, savaş, diplomasi, NATO, AB, BM',
  ekonomi:       'Ekonomi, borsa, döviz, faiz, enflasyon, şirket, finans, kripto para',
  spor:          'Genel spor haberleri (branş belli değilse), olimpiyat açılış/kapanış gibi',
  futbol:        'Futbol maçları, gol, lig, transfer, FIFA, UEFA, Süper Lig, Şampiyonlar Ligi',
  basketbol:     'Basketbol haberleri, NBA, EuroLeague, FIBA, Türkiye basketbol ligi',
  voleybol:      'Voleybol haberleri, CEV, FIVB, Türkiye voleybol ligi',
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
  'yerel-haber': 'Belirli bir şehir/ilçeye ait yerel haber (tek şehir adı geçiyor)',
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
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (!geminiKey) return null

  // Use a lightweight model for speed and cost
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'

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
1. KAYNAK ADINI GÖRMEZDEN GEL — "Milliyet Magazin", "Sabah Spor", "Hürriyet Otomobil" gibi kaynak isimleri kategoriye etki ETMEMELİ. Haberin GERÇEK içeriği her şeyi belirler.
2. Siyasi/meclis/seçim/hükümet içeriği → mutlaka "siyaset" (kaynak spor gazetesi bile olsa)
3. Yabancı ülke/savaş/diplomasi haberi → mutlaka "dunya"
4. Ekonomi/borsa/döviz/şirket haberi → mutlaka "ekonomi"
5. Futbol maçı/gol/lig/transfer → "futbol" (genel "spor" değil)
6. Yemek/restoran/şef/tarif haberi → "gastronomi"
7. Araba/otomobil/araç/TOGG/elektrikli araç → "otomobil"
8. Sinema filmi/vizyona girenler → "sinema", tiyatro oyunu → "tiyatro", konser haberi → "konser"
9. Magazin = SADECE ünlülerin kişisel hayatı, ilişkisi, skandalı, dedikodu
10. Mevcut kategori doğruysa onayla, yanlışsa düzelt

JSON formatında yanıt ver:
{"categoryId": "kategori-adı", "confidence": 85, "reason": "kısa açıklama"}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 200,
          },
        }),
        signal: AbortSignal.timeout(8_000),
      }
    )

    if (!res.ok) return null

    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
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
