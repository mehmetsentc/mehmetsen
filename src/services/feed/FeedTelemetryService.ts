import 'server-only'

import { recordSocialEvent } from '@/lib/social/events'
import { isSmartFeedTelemetryEnabled } from '@/lib/feed/featureFlag'
import type { FeedTelemetryBatchItem, FeedTelemetryEventType } from '@/types/smartFeed'
import type { SocialEventType } from '@/types/socialGraph'

export class FeedTelemetryService {
  async recordBatch(
    userId: string | null,
    sessionId: string | null,
    items: FeedTelemetryBatchItem[]
  ): Promise<void> {
    if (!items.length) return

    const telemetryOn = isSmartFeedTelemetryEnabled()
    for (const item of items) {
      if (telemetryOn) {
        await recordSocialEvent({
          eventType: item.eventType as SocialEventType,
          userId,
          targetType: item.articleId ? 'article' : 'feed',
          targetId: item.articleId ?? item.feedType ?? null,
          metadata: {
            sessionId,
            dwellMs: item.dwellMs,
            clusterId: item.clusterId,
            ...item.metadata,
          },
        }).catch(() => {})
      }

      // Always log observability events server-side (no PII)
      if (isObservabilityEvent(item.eventType)) {
        console.info('[smart-feed]', item.eventType, {
          feedType: item.feedType,
          articleId: item.articleId,
          userId: userId ? 'auth' : 'guest',
        })
      }
    }
  }
}

function isObservabilityEvent(type: FeedTelemetryEventType): boolean {
  return (
    type === 'feed_request' ||
    type === 'feed_empty' ||
    type === 'feed_error'
  )
}

export function logColdStartMetric(
  event: 'cold_start_feed_requested' | 'cold_start_mode' | 'cold_start_empty',
  meta?: Record<string, unknown>
): void {
  console.info(`[cold-start] ${event}`, meta ?? {})
}

export const feedTelemetryService = new FeedTelemetryService()
