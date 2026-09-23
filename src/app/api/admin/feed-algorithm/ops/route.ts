import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isNfRankLiveEnabled } from '@/lib/feed/featureFlag'
import type { FeedAlgorithmOps } from '@/lib/feed/feedAlgorithmOps'
import {
  getFeedAlgorithmOpsAdmin,
  saveFeedAlgorithmOps,
} from '@/services/feed/feedAlgorithmOps.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'algorithm:view')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await getFeedAlgorithmOpsAdmin()
  return NextResponse.json(body)
}

export async function PUT(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'algorithm:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<FeedAlgorithmOps>
  try {
    body = (await request.json()) as Partial<FeedAlgorithmOps>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }

  try {
    const ops = await saveFeedAlgorithmOps(body, auth.email || auth.uid)
    return NextResponse.json({ ops, persisted: true, envLive: isNfRankLiveEnabled() })
  } catch (err) {
    console.error('[api/admin/feed-algorithm/ops]', err)
    return NextResponse.json({ error: 'Kayıt başarısız' }, { status: 503 })
  }
}
