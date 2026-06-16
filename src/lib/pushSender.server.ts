/**
 * Server-side push notification sender (web-push library).
 * Used from API routes + pipeline (breaking news trigger).
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'

const PUSH_SUBSCRIPTIONS_COLLECTION = 'pushSubscriptions'

export interface PushPayload {
  title: string
  body: string
  url?: string
  image?: string
  tag?: string
  breaking?: boolean
  postId?: string
}

interface StoredSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: number
}

/** Lazily load web-push to keep server bundle lean. */
async function getWebPush() {
  // Dynamic import — web-push is Node-only (not bundled into client)
  const wp = await import('web-push')
  // web-push exports as a plain namespace; access it directly
  const module = wp as typeof import('web-push')

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@nahaber.com'

  if (!publicKey || !privateKey) {
    throw new Error('[push] VAPID keys not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)')
  }

  module.setVapidDetails(subject, publicKey, privateKey)
  return module
}

/** Store a new push subscription in Firestore. */
export async function storePushSubscription(
  subscription: {
    endpoint: string
    keys?: { p256dh?: string; auth?: string }
    userId?: string
  }
): Promise<void> {
  const db = getAdminFirestore()
  const id = Buffer.from(subscription.endpoint).toString('base64').slice(0, 64)
  await db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id).set(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys ?? {},
      userId: subscription.userId ?? null,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    { merge: true }
  )
}

/** Remove a push subscription (unsubscribe). Verifies ownership when userId provided. */
export async function removePushSubscription(endpoint: string, userId?: string): Promise<void> {
  const db = getAdminFirestore()
  const id = Buffer.from(endpoint).toString('base64').slice(0, 64)
  const ref = db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id)
  if (userId) {
    const snap = await ref.get()
    const owner = snap.data()?.userId as string | undefined
    if (owner && owner !== userId) return
  }
  await ref.delete()
}

/** Send a push notification to ALL subscribers. */
export async function broadcastPush(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const db = getAdminFirestore()
  const snap = await db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).limit(5000).get()
  if (snap.empty) return { sent: 0, failed: 0 }

  let wp: Awaited<ReturnType<typeof getWebPush>>
  try {
    wp = await getWebPush()
  } catch (err) {
    console.error('[push] web-push not available:', err)
    return { sent: 0, failed: 0 }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0
  const toDelete: string[] = []

  await Promise.allSettled(
    snap.docs.map(async (doc) => {
      const sub = doc.data() as StoredSubscription
      try {
        await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body)
        sent++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        // 410 = Gone, 404 = Not Found → subscription expired, remove it
        if (statusCode === 410 || statusCode === 404) {
          toDelete.push(doc.id)
        }
        failed++
      }
    })
  )

  // Clean up expired subscriptions in batch
  if (toDelete.length > 0) {
    const batch = db.batch()
    toDelete.forEach((id) => batch.delete(db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id)))
    await batch.commit()
  }

  console.log(`[push] broadcast: sent=${sent} failed=${failed} cleaned=${toDelete.length}`)
  return { sent, failed }
}

/** Send a breaking news push notification. */
export async function sendBreakingNewsPush(opts: {
  title: string
  summary: string
  slug: string
  postId: string
  image?: string
}): Promise<void> {
  const url = `https://www.nahaber.com/news/${opts.slug}`
  await broadcastPush({
    title: `🔴 SON DAKİKA: ${opts.title}`,
    body: opts.summary.slice(0, 120),
    url,
    image: opts.image,
    tag: `breaking-${opts.postId}`,
    breaking: true,
    postId: opts.postId,
  }).catch((err) => console.error('[push] breaking news push failed:', err))
}
