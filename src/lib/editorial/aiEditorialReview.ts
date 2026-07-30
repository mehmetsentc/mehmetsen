/**
 * AI Genel Yayın Editörü
 *
 * Pending bir haberi son 48 saatte yayınlanan haberlerle karşılaştırır.
 * - Benzersiz → status: 'published' (otomatik yayınla)
 * - Tekrar haber → isDuplicate: true, status: 'pending' (insan onayına bırak)
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_MODEL = process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash'
const WINDOW_MS = 48 * 60 * 60 * 1000 // 48 saat

export interface EditorialReviewResult {
  isDuplicate: boolean
  reason: string
  action: 'published' | 'pending'
}

interface ArticleInput {
  id: string
  title: string
  summary?: string | null
  categoryId?: string | null
}

/**
 * Son 48 saatte yayınlanan haberleri getirir (aynı veya farklı kategori, max 60 haber).
 */
async function fetchRecentPublished(categoryId?: string | null): Promise<Array<{ title: string; summary: string }>> {
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString()

  const db = getAdminFirestore()
  let query = db
    .collection('news')
    .where('status', '==', 'published')
    .where('publishedAt', '>=', cutoff)
    .orderBy('publishedAt', 'desc')
    .limit(60)

  // Önce aynı kategoriden ara (daha güvenilir sonuç), kategori yoksa genel
  if (categoryId) {
    try {
      const snap = await db
        .collection('news')
        .where('status', '==', 'published')
        .where('categoryId', '==', categoryId)
        .where('publishedAt', '>=', cutoff)
        .orderBy('publishedAt', 'desc')
        .limit(40)
        .get()

      if (snap.size >= 5) {
        return snap.docs.map((d) => ({
          title: String(d.data().title || ''),
          summary: String(d.data().summary || '').slice(0, 150),
        }))
      }
    } catch {
      // Composite index yoksa genel sorguya düş
    }
  }

  const snap = await query.get()
  return snap.docs.map((d) => ({
    title: String(d.data().title ?? ''),
    summary: String(d.data().summary ?? '').slice(0, 150),
  }))
}

/**
 * Tek bir haberi AI ile incele.
 */
export async function runEditorialReview(article: ArticleInput): Promise<EditorialReviewResult> {
  if (!DEEPSEEK_API_KEY) {
    return { isDuplicate: false, reason: 'API key yok', action: 'published' }
  }

  // Wrap Firestore fetch in try-catch — missing index or permission errors must not crash the cron
  let recent: Array<{ title: string; summary: string }> = []
  try {
    recent = await fetchRecentPublished(article.categoryId)
  } catch (err) {
    console.error('[editorialReview] fetchRecentPublished hatası:', err)
    return { isDuplicate: false, reason: 'Karşılaştırma sorgusu başarısız', action: 'published' }
  }

  if (recent.length === 0) {
    return { isDuplicate: false, reason: 'Son 48 saatte karşılaştırılacak haber yok', action: 'published' }
  }

  const recentList = recent
    .slice(0, 50)
    .map((a, i) => `${i + 1}. ${a.title}${a.summary ? ' — ' + a.summary : ''}`)
    .join('\n')

  const prompt = `Sen deneyimli bir Türk haber editörüsün. Görüşmek haberin son 48 saatte yayınlanan haberlerden hangisiyle örtüştüğünü belirle.

YENİ HABER:
Başlık: ${article.title}
${article.summary ? `Özet: ${article.summary.slice(0, 300)}` : ''}

SON 48 SAATTEKİ HABERLER (${recent.length} haber):
${recentList}

Kurallar:
- Aynı olay, aynı konu ama farklı detay/açı içeriyorsa → tekrar SAYILIR
- Tamamen farklı olay veya önemli yeni gelişme içeriyorsa → tekrar SAYILMAZ
- Spor skorları, hava durumu gibi rutin güncellemeler → tekrar SAYILMAZ (her gün yenilenir)

Sadece JSON döndür, başka hiçbir şey yazma:
{"isDuplicate": true|false, "reason": "kısa Türkçe açıklama (max 100 karakter)"}`

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      console.error('[editorialReview] DeepSeek HTTP error:', res.status)
      return { isDuplicate: false, reason: `API hatası: ${res.status}`, action: 'published' }
    }

    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content ?? '{}'
    // Robust JSON extraction — handles markdown code fences from models that ignore response_format
    let jsonStr = raw.trim()
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonStr = fence[1].trim()
    if (!jsonStr.startsWith('{')) {
      const obj = jsonStr.match(/\{[\s\S]*\}/)
      if (obj) jsonStr = obj[0]
    }
    const parsed = JSON.parse(jsonStr) as { isDuplicate?: boolean; reason?: string }

    const isDuplicate = parsed.isDuplicate === true
    const reason = String(parsed.reason || '').trim()

    return {
      isDuplicate,
      reason,
      action: isDuplicate ? 'pending' : 'published',
    }
  } catch (err) {
    console.error('[editorialReview] Hata:', err)
    return { isDuplicate: false, reason: 'İnceleme hatası', action: 'published' }
  }
}

/**
 * İnceleme sonucunu Firestore'a yaz.
 * - Benzersiz → status: 'published', publishedAt set
 * - Tekrar → isDuplicate: true, status: 'pending' olarak kalır
 */
export async function applyReviewToFirestore(
  articleId: string,
  result: EditorialReviewResult
): Promise<void> {
  const ref = getAdminFirestore().collection('news').doc(articleId)

  if (result.action === 'published') {
    await ref.update({
      status: 'published',
      publishedAt: new Date().toISOString(),
      isDuplicate: false,
      duplicateReason: FieldValue.delete(),
      editorialReviewedAt: new Date().toISOString(),
    })
  } else {
    await ref.update({
      status: 'pending',
      isDuplicate: true,
      duplicateReason: result.reason,
      editorialReviewedAt: new Date().toISOString(),
    })
  }
}
