import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { mapJobClassifiedDoc } from '@/services/jobClassifiedService.server'
import type { JobClassifiedStatus, JobClassifiedType } from '@/types/jobClassified'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status') || 'pending'
  const typeParam = url.searchParams.get('type') // employer | seeker | all
  const citySlug = url.searchParams.get('citySlug')?.trim() || ''

  const allowed: Array<JobClassifiedStatus | 'all'> = ['pending', 'approved', 'rejected', 'all']
  if (!allowed.includes(statusParam as JobClassifiedStatus | 'all')) {
    return NextResponse.json({ error: 'Geçersiz status' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const col = db.collection(Collections.JOB_CLASSIFIEDS)

    let snap
    if (statusParam === 'all') {
      snap = await col
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
        .catch(async () => col.limit(200).get())
    } else {
      snap = await col
        .where('status', '==', statusParam)
        .orderBy('createdAt', 'desc')
        .limit(150)
        .get()
        .catch(async () =>
          col.where('status', '==', statusParam).limit(150).get()
        )
    }

    let items = snap.docs
      .map((d) => mapJobClassifiedDoc(d.id, d.data() as Record<string, unknown>))
      .filter(Boolean)

    if (typeParam === 'employer' || typeParam === 'seeker') {
      items = items.filter((i) => i!.type === (typeParam as JobClassifiedType))
    }
    if (citySlug) {
      items = items.filter((i) => i!.citySlug === citySlug)
    }

    items.sort((a, b) => (b!.createdAt || '').localeCompare(a!.createdAt || ''))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }
}
