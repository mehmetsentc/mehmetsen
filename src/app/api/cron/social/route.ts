/**
 * GET|POST /api/cron/social
 *
 * Cron job — runs every 5 minutes via cron-job.org.
 * Scans Firestore `news` collection for Çanakkale articles that have not
 * yet been published to social media, then publishes them to Facebook and
 * Instagram, finally marking each as done.
 *
 * Auth: Bearer CRON_SECRET  (same secret used by all newsroom crons)
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { publishToFacebook } from '@/lib/social/facebook'
import { publishToInstagram } from '@/lib/social/instagram'
import type {
  SocialNewsItem,
  SocialCronItemResult,
  SocialCronResult,
  SocialPublishPayload,
  SocialPublishResult,
} from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Delay between each news item to respect API rate limits. */
const INTER_ITEM_DELAY_MS = 2000

/** Category filter — only publish articles from this category. */
const TARGET_CATEGORY = 'canakkale'

/** Max articles processed per cron run to avoid timeouts. */
const BATCH_LIMIT = 20

/** Base URL for article links (falls back gracefully). */
function buildArticleUrl(item: SocialNewsItem): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nahaber.com').replace(/\/$/, '')
  return item.url?.trim() ? item.url.trim() : `${base}/news/${item.id}`
}

async function runSocialCron(): Promise<SocialCronResult> {
  const db = getAdminFirestore()

  // Query: category == canakkale AND (socialPublished missing OR false)
  const snap = await db
    .collection(Collections.NEWS)
    .where('category', '==', TARGET_CATEGORY)
    .where('socialPublished', '!=', true)
    .orderBy('socialPublished')   // required when using != filter
    .orderBy('createdAt', 'desc')
    .limit(BATCH_LIMIT)
    .get()

  const items: SocialNewsItem[] = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<SocialNewsItem, 'id'>),
  }))

  const results: SocialCronItemResult[] = []
  let succeeded = 0
  let failed = 0

  for (const item of items) {
    const payload: SocialPublishPayload = {
      newsId: item.id,
      title: item.title ?? '',
      description: item.description?.trim() || undefined,
      imageUrl: item.imageUrl?.trim() || undefined,
      articleUrl: buildArticleUrl(item),
    }

    // ── Facebook ──────────────────────────────────────────────────────────
    let fbResult: SocialPublishResult = { success: false, error: 'not attempted' }
    try {
      fbResult = await publishToFacebook(payload)
    } catch (err) {
      fbResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // Rate-limit pause between platforms
    await new Promise((resolve) => setTimeout(resolve, INTER_ITEM_DELAY_MS))

    // ── Instagram ─────────────────────────────────────────────────────────
    let igResult: SocialPublishResult = { success: false, error: 'not attempted' }
    try {
      igResult = await publishToInstagram(payload)
    } catch (err) {
      igResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // ── Mark done if at least Facebook succeeded ──────────────────────────
    // We consider Facebook the primary platform. Instagram is best-effort
    // (fails without image). If FB succeeded, we mark the article done so
    // it is not retried endlessly.
    const markedDone = fbResult.success

    if (markedDone) {
      try {
        const update: Record<string, unknown> = {
          socialPublished: true,
          socialPublishedAt: FieldValue.serverTimestamp(),
        }
        if (fbResult.platformId) update.facebookPostId = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId

        await db.collection(Collections.NEWS).doc(item.id).update(update)
        succeeded++
      } catch (err) {
        console.error(`[cron/social] Firestore update failed for ${item.id}:`, err)
        failed++
      }
    } else {
      failed++
      console.warn(`[cron/social] Facebook failed for ${item.id} — will retry next run`)
    }

    results.push({
      newsId: item.id,
      title: item.title ?? '',
      facebook: fbResult,
      instagram: igResult,
      markedDone,
    })

    // Rate-limit pause before the next article
    await new Promise((resolve) => setTimeout(resolve, INTER_ITEM_DELAY_MS))
  }

  return {
    processed: items.length,
    succeeded,
    failed,
    items: results,
  }
}

async function handleRequest(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSocialCron()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Social cron failed'
    console.error('[cron/social] fatal error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handleRequest
export const POST = handleRequest
