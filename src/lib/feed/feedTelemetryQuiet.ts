/** Quiet telemetry helper — never throws into UI. */
import { getOrCreateFeedSessionId } from '@/lib/feed/feedSeenClient'
import { getClientAuthToken } from '@/lib/firebase/auth'

export async function postTelemetryQuiet(payload: {
  events?: Array<{
    eventType: string
    articleId?: string
    clusterId?: string | null
    feedType?: string
    dwellMs?: number
    metadata?: Record<string, unknown>
  }>
}) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-feed-session': getOrCreateFeedSessionId(),
    }
    const token = await getClientAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
    await fetch('/api/feed/telemetry', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    /* ignore */
  }
}
