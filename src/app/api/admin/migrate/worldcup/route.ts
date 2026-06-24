/**
 * POST /api/admin/migrate/worldcup
 * Dünya Kupası 2026 ile ilgili tüm haberleri `dunya-kupasi-2026` kategorisine taşır.
 * Bearer token (CRON_SECRET) veya CMS super_admin gerektirir.
 *
 * Body: { limit?: number; dryRun?: boolean }
 * Response: { checked, updated, unchanged, failed, dryRun, durationMs, changes }
 */
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${CRON_SECRET}` && CRON_SECRET.length > 0
}

/** Dünya Kupası 2026 anahtar kelimeleri (küçük harfle karşılaştırılır) */
const WC_KEYWORDS = [
  'dünya kupası 2026', 'dunya kupasi 2026',
  '2026 dünya kupası', '2026 dunya kupasi',
  'fifa 2026', 'fifa dünya kupası', 'fifa dunya kupasi',
  'dünya kupası grup', 'dunya kupasi grup',
  'dünya kupası maç', 'dunya kupasi mac',
  'dünya kupası eleme', 'dunya kupasi eleme',
  'dünya kupası finali', 'dunya kupasi finali',
  'dünya kupası şampiyonu', 'dunya kupasi sampiyonu',
  'dünya kupası yarı final', 'dünya kupası çeyrek final',
  'dünya kupası puan', 'dünya kupası sıralama',
  'dünya kupası kadro', 'dünya kupası golü', 'dünya kupası galibi',
  'milli takım dünya kupası', 'türkiye dünya kupası',
  'world cup 2026', '2026 world cup',
  'fifa world cup 2026', 'world cup group stage',
  'world cup standings', 'world cup results',
  'world cup squad', 'world cup score',
  'world cup knockout', 'world cup match',
]

function containsWcKeyword(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR')
  return WC_KEYWORDS.some((kw) => lower.includes(kw))
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { limit?: number; dryRun?: boolean } = {}
  try { body = await request.json() } catch { /* ignore */ }

  const limit = Math.min(body.limit ?? 200, 1000)
  const dryRun = body.dryRun ?? false

  const db = getAdminFirestore()
  const startMs = Date.now()

  // Tüm yayınlanmış haberleri çek (büyük koleksiyonlar için batch yapılmalı)
  const snap = await db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(limit)
    .get()

  let updated = 0
  let unchanged = 0
  let failed = 0
  const changes: Array<{ id: string; title: string; old: string }> = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const title = (data.title as string) ?? ''
    const content = (data.content as string) ?? (data.description as string) ?? (data.summary as string) ?? ''
    const oldCategory = (data.categoryId as string) ?? 'gundem'

    // Zaten doğru kategorideyse atla
    if (oldCategory === 'dunya-kupasi-2026') {
      unchanged++
      continue
    }

    // Başlık veya içerik WC keyword'ü içeriyor mu?
    const isWcArticle = containsWcKeyword(title) || containsWcKeyword(content.slice(0, 2000))
    if (!isWcArticle) {
      unchanged++
      continue
    }

    try {
      changes.push({ id: doc.id, title: title.slice(0, 80), old: oldCategory })
      if (!dryRun) {
        await doc.ref.update({
          categoryId: 'dunya-kupasi-2026',
          migratedToWorldCupAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      updated++
    } catch (err) {
      console.error('[migrate/worldcup] failed', doc.id, err)
      failed++
    }
  }

  // ISR cache'i temizle
  if (!dryRun && updated > 0) {
    try {
      revalidatePath('/kategori/dunya-kupasi-2026')
      revalidatePath('/kategori/spor')
      revalidatePath('/kategori/futbol')
      revalidatePath('/feed')
      revalidatePath('/')
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    checked: snap.docs.length,
    updated,
    unchanged,
    failed,
    dryRun,
    durationMs: Date.now() - startMs,
    changes,
  })
}
