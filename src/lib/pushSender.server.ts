/**
 * Server-side push notification sender — OneSignal REST API.
 * Replaces the old web-push / VAPID approach.
 * OneSignal manages all subscriber storage — no Firestore pushSubscriptions needed.
 */
import 'server-only'

export interface PushPayload {
  title: string
  body: string
  url?: string
  image?: string
  tag?: string
  breaking?: boolean
  postId?: string
}

/** Send a push to ALL OneSignal subscribers. */
export async function broadcastPush(
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_REST_API_KEY

  if (!appId || !apiKey) {
    console.warn('[push] Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY — skipping push')
    return { sent: 0, failed: 0 }
  }

  const body: Record<string, unknown> = {
    app_id: appId,
    included_segments: ['All'],
    headings: { tr: payload.title, en: payload.title },
    contents: { tr: payload.body, en: payload.body },
    ttl: 3600,
  }

  if (payload.url) body.url = payload.url
  if (payload.image) {
    body.big_picture = payload.image
    body.chrome_web_image = payload.image
    body.large_icon = payload.image
  }
  if (payload.tag) body.collapse_id = payload.tag
  if (payload.breaking) {
    body.priority = 10 // urgent
    body.android_channel_id = 'breaking-news'
  }

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as { id?: string; recipients?: number; errors?: string[] }

    if (!res.ok) {
      console.error('[push] OneSignal error:', data)
      return { sent: 0, failed: 1 }
    }

    const sent = data.recipients ?? 0
    console.log(`[push] OneSignal broadcast sent=${sent} id=${data.id}`)
    return { sent, failed: 0 }
  } catch (err) {
    console.error('[push] OneSignal fetch error:', err)
    return { sent: 0, failed: 1 }
  }
}

/** Send a breaking news push notification. */
export async function sendBreakingNewsPush(opts: {
  title: string
  summary: string
  slug: string
  postId: string
  image?: string
}): Promise<void> {
  const url = `https://www.nahaber.com/haber/${opts.slug}`
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

// ── Legacy stubs — kept for backward compat, no-ops with OneSignal ──────────

export async function storePushSubscription(_sub: unknown): Promise<void> {
  // OneSignal manages subscriptions automatically — no-op
}

export async function removePushSubscription(_endpoint: string, _userId?: string): Promise<void> {
  // OneSignal manages subscriptions automatically — no-op
}
