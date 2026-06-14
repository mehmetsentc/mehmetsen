/**
 * Headline + token similarity for near-duplicate detection (>90% → update, don't create).
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'

// 0.52 = yeterince benzer. 0.65 çok yüksekti — aynı olayı farklı başlıkla anlatan haberler kaçıyordu.
// Örnek: "Güngören'de kontrollü yıkım faciası" vs "Güngören'de kontrollü yıkım sırasında apartman çöktü"
// → title Jaccard ~0.50, combined ~0.57 → 0.65 eşiğini geçiyordu → iki kez yayınlanıyordu.
const SIMILARITY_THRESHOLD = 0.52
// Başlık benzerliği tek başına bu eşiği geçerse, gövde kontrolüne gerek kalmadan duplikat say.
const TITLE_ONLY_THRESHOLD = 0.46
const LOOKBACK_MS = 48 * 60 * 60 * 1000
const MAX_CANDIDATES = 80

export interface SimilarityMatch {
  newsId: string
  similarity: number
  title: string
}

const STOP_WORDS = new Set([
  've', 'bir', 'bu', 'için', 'ile', 'de', 'da', 'den', 'dan', 'the', 'a', 'an', 'in', 'on', 'to',
])

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  return new Set(tokens)
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function computeArticleSimilarity(
  titleA: string,
  bodyA: string,
  titleB: string,
  bodyB: string
): number {
  const titleTokensA = tokenize(titleA)
  const titleTokensB = tokenize(titleB)
  const bodyTokensA = tokenize(bodyA)
  const bodyTokensB = tokenize(bodyB)

  const titleSim = jaccardSimilarity(titleTokensA, titleTokensB)
  const bodySim = jaccardSimilarity(bodyTokensA, bodyTokensB)

  // Başlık benzerliği tek başına yeterliyse combined skoru yükselt (duplikatı yakala).
  // Örnek: aynı olayı farklı kelimelerle anlatan haberler: titleSim ~0.50 ama body boşsa kaçıyordu.
  if (titleSim >= TITLE_ONLY_THRESHOLD) {
    return Math.max(titleSim * 0.55 + bodySim * 0.45, titleSim * 0.9)
  }

  // Headline weighted higher — breaking rewrites often share body facts.
  return titleSim * 0.55 + bodySim * 0.45
}

export async function findSimilarPublishedArticle(
  db: Firestore,
  title: string,
  body: string
): Promise<SimilarityMatch | null> {
  const since = Date.now() - LOOKBACK_MS

  // Hem yayınlanmış haberler hem de henüz draft'taki haberler kontrol edilir.
  // Sorun: birinci haber draft'tayken ikinci gelirse sadece published kontrolü yakalamıyor.
  const [publishedSnap, draftSnap] = await Promise.all([
    db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(MAX_CANDIDATES)
      .get(),
    db
      .collection(Collections.NEWS_DRAFTS)
      .where('draftStatus', 'in', ['pending_review', 'approved'])
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(MAX_CANDIDATES)
      .get(),
  ])

  const allDocs = [...publishedSnap.docs, ...draftSnap.docs]
  let best: SimilarityMatch | null = null

  for (const doc of allDocs) {
    const data = doc.data() as { title?: string; description?: string; summary?: string }
    const candidateTitle = data.title ?? ''
    const candidateBody = data.description ?? data.summary ?? ''
    const similarity = computeArticleSimilarity(title, body, candidateTitle, candidateBody)

    if (similarity >= SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { newsId: doc.id, similarity, title: candidateTitle }
    }
  }

  return best
}

export { SIMILARITY_THRESHOLD }
