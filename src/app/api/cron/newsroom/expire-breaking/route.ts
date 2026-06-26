import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'

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
 * Güncellenen alanlar:
 *   - isBreaking: false
 *   - breakingScore: 30
 *   - categoryId: 'gundem'  (zaten son-dakika değilse dokunmaz)
 *   - _breakingExpiredAt: timestamp
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
  const cutoff = Date.now() - BREAKING_TTL_MS

  let expired = 0
  let skipped = 0
  const errors: string[] = []

  for (const col of [Collections.NEWS, Collections.POSTS]) {
    // isBreaking=true ve publishedAt < cutoff
    let snap
    try {
      snap = await db
        .collection(col)
        .where('isBreaking', '==', true)
        .where('publishedAt', '<', cutoff)
        .get()
    } catch (e) {
      const msg = `[expire-breaking] ${col} query failed: ${e instanceof Error ? e.message : e}`
      console.error(msg)
      errors.push(msg)
      continue
    }

    if (snap.empty) continue

    const batch = db.batch()
    let batchCount = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      // Admin tarafından el ile son-dakikaya alınmışsa dokunma
      // (manualBreaking flag'i varsa atla)
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
    // Cache'i temizle
    revalidatePath('/kategori/son-dakika')
    revalidatePath('/kategori/gundem')
    revalidatePath('/')
    console.log(`[expire-breaking] ${expired} haber son-dakika→gündem taşındı`)
  }

  return NextResponse.json(
    { ok: true, expired, skipped, errors },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
