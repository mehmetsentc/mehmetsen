/**
 * OneSignal server-side notification sender.
 * Only call from server-side code (API routes, cron workers).
 * Never expose ONESIGNAL_REST_API_KEY to the client.
 */

interface SendPushOptions {
  title: string
  message: string
  url: string
  imageUrl?: string
  /** OneSignal segment — default "All" */
  segment?: string
  /** TTL in seconds — default 3600 (1 hour) */
  ttl?: number
}

interface OneSignalResponse {
  id?: string
  recipients?: number
  errors?: string[]
}

export async function sendPushNotification(
  opts: SendPushOptions
): Promise<{ success: boolean; data?: OneSignalResponse; error?: string }> {
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_REST_API_KEY

  if (!appId || !apiKey) {
    console.warn('[OneSignal] Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY env vars')
    return { success: false, error: 'Missing credentials' }
  }

  const body = {
    app_id: appId,
    included_segments: [opts.segment ?? 'All'],
    headings: { tr: opts.title, en: opts.title },
    contents: { tr: opts.message, en: opts.message },
    url: opts.url,
    ttl: opts.ttl ?? 3600,
    ...(opts.imageUrl
      ? {
          big_picture: opts.imageUrl,
          large_icon: opts.imageUrl,
          chrome_web_image: opts.imageUrl,
        }
      : {}),
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

    const data: OneSignalResponse = await res.json()

    if (!res.ok) {
      console.error('[OneSignal] Push failed:', data)
      return { success: false, data, error: data.errors?.join(', ') ?? 'Unknown error' }
    }

    console.log(`[OneSignal] Push sent — id=${data.id} recipients=${data.recipients}`)
    return { success: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    console.error('[OneSignal] Push error:', err)
    return { success: false, error: msg }
  }
}
