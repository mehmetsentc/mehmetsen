/**
 * Diagnostic endpoint — server-side feed pool size + per-bucket counts.
 * Used to verify SSR data is reaching the page. Returns no document content,
 * only counts and a tiny sample for debug purposes.
 *
 * **Requires Bearer CRON_SECRET** — anonymous access used to leak Firestore
 * samples + environment fingerprints (which Admin SDK vars were present etc.),
 * which is enough recon info to make this a meaningful information disclosure
 * vector. Gating with the existing newsroom secret keeps the tool available
 * for ops without exposing it to the public.
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const result: Record<string, unknown> = { ok: false }

  // 1) Admin SDK init test
  try {
    const db = getAdminFirestore()
    result.adminInit = 'ok'

    // 2) Raw count probe — just count published news
    try {
      const snap = await db
        .collection(NEWS_COLLECTION)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(5)
        .get()
      result.rawPublishedSampleSize = snap.docs.length
      result.rawSample = snap.docs.slice(0, 2).map((d) => ({
        id: d.id,
        title: (d.data().title as string)?.slice(0, 80) ?? null,
        categoryId: d.data().categoryId ?? null,
        status: d.data().status ?? null,
        publishedAt: d.data().publishedAt ?? null,
      }))
    } catch (rawErr) {
      result.rawQueryError = rawErr instanceof Error ? rawErr.message : String(rawErr)
    }

    // 3) getHomeFeedInitialData test
    try {
      const data = await getHomeFeedInitialData()
      result.homeFeed = {
        breaking: data.breaking.length,
        featured: data.featured.length,
        latest: data.latest.length,
        mostRead: data.mostRead.length,
        categoryRails: Object.fromEntries(
          Object.entries(data.categoryRails).map(([k, v]) => [k, v?.length ?? 0])
        ),
      }
      result.ok = true
    } catch (feedErr) {
      result.homeFeedError = feedErr instanceof Error ? feedErr.message : String(feedErr)
    }
  } catch (initErr) {
    result.adminInitError = initErr instanceof Error ? initErr.message : String(initErr)
  }

  result.env = {
    hasServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()),
    hasProjectId: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()),
    hasClientEmail: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()),
    hasPrivateKey: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()),
    publicProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
