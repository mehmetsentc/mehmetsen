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
  'teknoloji',
  'saglik',
  'bilim',
  'magazin',
  'kultur',
  'yerel-haber',
] as const

export type NewsCategory = (typeof CATEGORIES)[number]

const CATEGORY_DESCRIPTIONS: Record<NewsCategory, string> = {
  gundem:       'Genel gündem, yerel yönetim, sosyal, turizm, çevre, belediye haberleri',
  siyaset:      'Siyasi partiler, seçimler, meclis, hükümet, Erdoğan, CHP, AKP, MHP politikası',
  dunya:        'Uluslararası haberler, yabancı ülkeler, savaş, diplomasi, NATO, AB',
  ekonomi:      'Ekonomi, borsa, döviz, faiz, enflasyon, şirket haberleri, finans, kripto',
  spor:         'Futbol, basketbol, atletizm, olimpiyat, transfer, maç sonuçları',
  teknoloji:    'Teknoloji, yapay zeka, yazılım, internet, telefon, bilgisayar',
  saglik:       'Sağlık, hastalık, ilaç, hastane, tıp, pandemi, beslenme',
  bilim:        'Bilim, uzay, NASA, araştırma, keşif, iklim, çevre bilimi',
  magazin:      'Ünlüler, dizi oyuncuları, film, müzik, moda, ilişki, skandal, magazin',
  kultur:       'Kültür, sanat, müze, edebiyat, tiyatro, mimari, gelenek',
  'yerel-haber':'Belirli bir şehir/ilçeye ait yerel haber (şehir adı geçiyor)',
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
  const model = 'gemini-2.0-flash-lite'

  const categoryList = CATEGORIES.map(
    c => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`
  ).join('\n')

  const prompt = `Sen deneyimli bir Türk haber editörüsün. Aşağıdaki haberin başlığını ve içeriğini okuyarak EN DOĞRU kategoriyi seç.

BAŞLIK: ${title}
İÇERİK (ilk 300 kelime): ${content.slice(0, 1500)}

MEVCUT KATEGORİ (kural-tabanlı sistem tarafından atandı): ${currentCategory}

KATEGORİ SEÇENEKLERİ:
${categoryList}

KURALLAR:
- Haberin GERÇEK içeriğine bak, kaynak adını (Milliyet Magazin, Sabah Spor vb.) göz önünde bulundurma
- Eğer haber bir şehirde geçen turizm/yönetim/çevre/sosyal konuysa → gundem veya yerel-haber
- Eğer haber ünlü kişi/dizi/film/ilişki hakkındaysa → magazin
- Mevcut kategori doğruysa onu onayla
- Sadece emin olduğunda farklı kategori öner (confidence ≥ 80)

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
