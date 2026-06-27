import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BREAKING_TTL_MS = 24 * 60 * 60 * 1000 // 24 saat
const TARGET_CATEGORY = 'gundem'

/**
 * GET/POST /api/cron/newsroom/expire-breaking
 *
 * Her saat bir kez çalışır.
 * isBreaking=true olan ve yayınlanma tarihi 4 saatten eski haberleri
 * bulup otomatik olarak "gündem" kategorisine taşır.
 *
 * ?force=true → publishedAt filtresi olmadan TÜM isBreaking=true dokümanları temizler.
 * ?restore=true → son 24 saatin yayınlanmış haberlerini isBreaking=true yapar (tek seferlik backfill).
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
  const restore = url.searchParams.get('restore') === 'true'

  // --- RESTORE MODU: son 24 saatin haberlerini isBreaking=true yap ---
  if (restore) {
    const since24h = Date.now() - BREAKING_TTL_MS
    const since24hTs = Timestamp.fromMillis(since24h)
    let restored = 0
    const restoreErrors: string[] = []

    for (const col of [Collections.NEWS, Collections.POSTS]) {
      for (const cutoff of [since24h, since24hTs] as const) {
        try {
          // Tek alan index (publishedAt) kullan — status bellekte filtrele
          const snap = await db
            .collection(col)
            .where('publishedAt', '>', cutoff)
            .get()

          let batch = db.batch()
          let count = 0
          for (const doc of snap.docs) {
            const d = doc.data()
            if (d.status !== 'published') continue // yayınlanmamış atla
            if (d.manualBreaking === false) continue // manuel kapatılmış
            batch.update(doc.ref, {
              isBreaking: true,
              updatedAt: FieldValue.serverTimestamp(),
            })
            count++
            restored++
            if (count === 499) {
              await batch.commit()
              batch = db.batch()
              count = 0
            }
          }
          if (count > 0) await batch.commit()
        } catch (e) {
          const msg = `[expire-breaking] restore ${col} failed: ${e instanceof Error ? e.message : e}`
          console.error(msg)
          restoreErrors.push(msg)
        }
      }
    }

    if (restored > 0) {
      revalidatePath('/kategori/son-dakika')
      revalidatePath('/')
    }
    return NextResponse.json(
      { ok: true, restored, errors: restoreErrors, mode: 'restore' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

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

    let batch = db.batch()
    let batchCount = 0

    for (const doc of docMap.values()) {
      const data = doc.data()
      // manualBreaking=true ise el ile eklenmiş — dokunma
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
        batch = db.batch() // yeni batch oluştur
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
