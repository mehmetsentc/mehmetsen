import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/backfill-breaking
 *
 * Son-dakika dışındaki kategoriye çekilmiş ama hâlâ isBreaking=true olan
 * tüm haberleri düzeltir: isBreaking=false, breakingScore=30 yapar.
 *
 * Admin-only — tek seferlik çalıştırılır.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()

  // Her iki collection'ı da tara
  const collections = [Collections.NEWS, Collections.POSTS]
  let fixed = 0
  const errors: string[] = []

  for (const col of collections) {
    // isBreaking=true olan TÜM haberleri çek
    const snap = await db
      .collection(col)
      .where('isBreaking', '==', true)
      .get()

    const batch = db.batch()
    let batchCount = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      const categoryId = data.categoryId as string | undefined

      // son-dakika kategorisindeyse dokunma
      if (categoryId === 'son-dakika') continue

      batch.update(doc.ref, {
        isBreaking: false,
        breakingScore: 30,
        updatedAt: FieldValue.serverTimestamp(),
        _fixedAt: FieldValue.serverTimestamp(),
      })
      batchCount++
      fixed++

      // Firestore batch max 500
      if (batchCount === 499) {
        await batch.commit()
        batchCount = 0
      }
    }

    if (batchCount > 0) {
      try {
        await batch.commit()
      } catch (e) {
        errors.push(`${col}: ${e instanceof Error ? e.message : 'batch error'}`)
      }
    }
  }

  return NextResponse.json({ ok: true, fixed, errors })
}
