import 'server-only'

import { randomUUID } from 'crypto'
import { getDb, hasDatabaseUrl } from '@/db'
import { socialEvents } from '@/db/schema/socialGraph'
import type { SocialEventType } from '@/types/socialGraph'

export async function recordSocialEvent(input: {
  eventType: SocialEventType
  userId?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  if (!hasDatabaseUrl()) return
  try {
    const db = getDb()
    await db.insert(socialEvents).values({
      id: randomUUID(),
      eventType: input.eventType,
      userId: input.userId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
    })
  } catch (err) {
    console.warn('[socialEvents] record failed:', err)
  }
}
