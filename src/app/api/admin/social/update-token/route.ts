/**
 * POST /api/admin/social/update-token
 *
 * Stores new Facebook / Instagram tokens in Firestore config/socialMedia.
 * tokenStore.ts reads from Firestore first, so the change takes effect
 * immediately (within 5 min cache TTL) without a redeploy.
 *
 * Body: { facebookPageToken: string, instagramToken?: string }
 * Auth: CRON_SECRET Bearer token
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const auth = request.headers.get('authorization') ?? ''
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { facebookPageToken?: string; instagramToken?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { facebookPageToken, instagramToken } = body
  if (!facebookPageToken) {
    return NextResponse.json({ error: 'facebookPageToken required' }, { status: 400 })
  }

  const db = getAdminFirestore()
  await db.collection('config').doc('socialMedia').set({
    facebookPageToken: facebookPageToken.trim(),
    instagramToken: (instagramToken ?? facebookPageToken).trim(),
    updatedAt: new Date().toISOString(),
  }, { merge: true })

  return NextResponse.json({ ok: true })
}
