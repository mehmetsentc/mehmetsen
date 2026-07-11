/**
 * POST /api/admin/backfill-images
 * Updates Firestore articles that have no coverImageUrl by fetching og:image via Jina Reader.
 *
 * Body: { secret: string, limit?: number, categoryId?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/firestore'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

export const runtime = 'nodejs'
export const maxDuration = 300

const JINA_TIMEOUT_MS = 15_000
const DEFAULT_BATCH = 30

async function fetchImageFromJina(sourceUrl: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${sourceUrl}`
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Timeout': '12',
      },
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const markdown = await res.text()

    // Extract first real image URL from markdown: ![alt](https://...)
    const match = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)
    if (!match?.[1]) return null
    const url = match[1]
    // Skip icons/logos/sprites
    if (/icon|logo|sprite|placeholder|1x1|pixel|favicon/i.test(url)) return null
    return url
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const authorized =
      isSyncSecretAuthorized(req) || (await verifyCmsToken(req, 'news:edit'))
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      limit?: number
      categoryId?: string
    }

    const batchLimit = Math.min(body.limit ?? DEFAULT_BATCH, 100)
    const db = getAdminFirestore()

    // Query articles missing coverImageUrl
    let q = db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('coverImageUrl', '==', '')
      .orderBy('publishedAt', 'desc')
      .limit(batchLimit)

    if (body.categoryId) {
      q = db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('categoryId', '==', body.categoryId)
        .where('coverImageUrl', '==', '')
        .orderBy('publishedAt', 'desc')
        .limit(batchLimit)
    }

    const snap = await q.get()

    if (snap.empty) {
      // Also try null coverImageUrl
      const snap2 = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(200)
        .get()

      const missing = snap2.docs.filter((d) => {
        const url = d.data().coverImageUrl
        return !url || url === ''
      }).slice(0, batchLimit)

      if (missing.length === 0) {
        return NextResponse.json({ updated: 0, message: 'No articles missing images' })
      }

      const results = await processDocs(missing)
      return NextResponse.json(results)
    }

    const results = await processDocs(snap.docs)
    return NextResponse.json(results)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

async function processDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<{
  processed: number
  updated: number
  failed: number
  skipped: number
  results: Array<{ id: string; sourceUrl: string; imageUrl: string | null; status: string }>
}> {
  const db = getAdminFirestore()
  let updated = 0, failed = 0, skipped = 0
  const results: Array<{ id: string; sourceUrl: string; imageUrl: string | null; status: string }> = []

  for (const doc of docs) {
    const data = doc.data()
    const sourceUrl = data.sourceUrl as string | undefined

    if (!sourceUrl) {
      skipped++
      results.push({ id: doc.id, sourceUrl: '', imageUrl: null, status: 'skipped:no-sourceUrl' })
      continue
    }

    const imageUrl = await fetchImageFromJina(sourceUrl)

    if (imageUrl) {
      try {
        await db.collection(Collections.NEWS).doc(doc.id).update({
          coverImageUrl: imageUrl,
          thumbnail: imageUrl,
          updatedAt: FieldValue.serverTimestamp(),
        })
        updated++
        results.push({ id: doc.id, sourceUrl, imageUrl, status: 'updated' })
      } catch {
        failed++
        results.push({ id: doc.id, sourceUrl, imageUrl, status: 'failed:write-error' })
      }
    } else {
      skipped++
      results.push({ id: doc.id, sourceUrl, imageUrl: null, status: 'skipped:no-image-found' })
    }

    // Small delay to avoid Jina rate limits
    await new Promise((r) => setTimeout(r, 200))
  }

  return { processed: docs.length, updated, failed, skipped, results }
}
