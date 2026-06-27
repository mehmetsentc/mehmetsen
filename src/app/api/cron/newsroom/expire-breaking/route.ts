import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BREAKING_TTL_MS = 4 * 60 * 60 * 1000 // 4 saat
const TARGET_CATEGORY = 'gundem'

/**
 * GET/POST /api/cron/newsroom/expire-breaking
 *
 * Her saat bir kez çalışır.
 * isBreaking=true olan ve yayınlanma tarihi 4 saatten eski haberleri
 * bulup otomatik olarak "gündem" kategorisine taşır.
 *
 * ?force=true → publishedAt filtresi olmadan TÜM isBreaking=true dokümanları temizler.
 * (tek seferlik backfill için kullanılır)
 */
export async function GET(request: Request) {
  return handler(request)
}
export async function POST(request: Request) {
  return handler(request)
}

async function handler(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()
  const url = new URL(request.url)
  const forceAll = url.searchParams.get('force') === 'true'

  const cutoffMs = Date.now() - BREAKING_TTL_MS
  const cutoffTs = Timestamp.fromMillis(cutoffMs)

  let expired = 0
  let skipped = 0
  const errors: string[] = []

  for (const col of [Collections.NEWS, Collections.POSTS]) {
    const docMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

    if (forceAll) {
      // Force mod: publishedAt filtresi yok — tüm isBreaking=true dokümanları temizle
      try {
        const snap = await db.collection(col).where('isBreaking', '==', true).get()
        for (const doc of snap.docs) docMap.set(doc.id, doc)
      } catch (e) {
        const msg = `[expire-breaking] ${col} force query failed: ${e instanceof Error ? e.message : e}`
        console.error(msg)
        errors.push(msg)
      }
    } else {
      // Normal mod: publishedAt tipi belirsiz (Number veya Timestamp) — iki query yap
      for (const cutoff of [cutoffMs, cutoffTs] as const) {
        try {
          const snap = await db
            .collection(col)
            .where('isBreaking', '==', true)
            .where('publishedAt', '<', cutoff)
            .get()
          for (const doc of snap.docs) docMap.set(doc.id, doc)
        } catch (e) {
          const typeName = cutoff instanceof Timestamp ? 'Timestamp' : 'Number'
          const msg = `[expire-breaking] ${col} query failed (${typeName}): ${e instanceof Error ? e.message : e}`
          console.error(msg)
          errors.push(msg)
        }
      }
    }

    if (docMap.size === 0) continue

    const batch = db.batch()
    let batchCount = 0

    for (const doc of docMap.values()) {
      const data = doc.data()
      if (data.manualBreaking === true) {
        skipped++
        continue
      }

      batch.update(doc.ref, {
        isBreaking: false,
        breakingScore: 30,
        categoryId: TARGET_CATEGORY,
        updatedAt: FieldValue.serverTimestamp(),
        _breakingExpiredAt: FieldValue.serverTimestamp(),
      })
      batchCount++
      expired++

      if (batchCount === 499) {
        await batch.commit()
        batchCount = 0
      }
    }

    if (batchCount > 0) {
      try {
        await batch.commit()
      } catch (e) {
        const msg = `[expire-breaking] ${col} batch commit failed: ${e instanceof Error ? e.message : e}`
        console.error(msg)
        errors.push(msg)
      }
    }
  }

  if (expired > 0) {
    revalidatePath('/kategori/son-dakika')
    revalidatePath('/kategori/gundem')
    revalidatePath('/')
    console.log(`[expire-breaking] ${expired} haber son-dakika→gündem taşındı (force=${forceAll})`)
  }

  return NextResponse.json(
    { ok: true, expired, skipped, errors, force: forceAll },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
