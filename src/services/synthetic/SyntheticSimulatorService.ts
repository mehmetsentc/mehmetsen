import 'server-only'

import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { userProfiles } from '@/db/schema/socialGraph'
import { isSyntheticSimulatorEnabled } from '@/lib/seo/featureFlag'
import { feedService } from '@/services/feed/FeedService'
import { feedTelemetryService } from '@/services/feed/FeedTelemetryService'
import { recordSocialEvent } from '@/lib/social/events'

export type SyntheticPersona =
  | 'LOCAL_NEWS_READER'
  | 'SPORTS_READER'
  | 'TECH_READER'
  | 'CASUAL_READER'
  | 'NEW_USER'

export interface SyntheticSimulateInput {
  persona: SyntheticPersona
  userId: string
  actions?: Array<
    | 'feed_request'
    | 'impression'
    | 'dwell'
    | 'skip'
    | 'open'
    | 'follow'
    | 'like'
    | 'save'
    | 'share'
  >
  articleId?: string | null
  publisherId?: string | null
}

const PERSONA_MODES: Record<SyntheticPersona, 'personal' | 'local' | 'breaking'> = {
  LOCAL_NEWS_READER: 'local',
  SPORTS_READER: 'personal',
  TECH_READER: 'personal',
  CASUAL_READER: 'personal',
  NEW_USER: 'personal',
}

export function assertSyntheticAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Synthetic simulator rejected in production')
  }
  if (!isSyntheticSimulatorEnabled()) {
    throw new Error('Synthetic simulator disabled')
  }
}

export class SyntheticSimulatorService {
  async ensureSyntheticUser(userId: string): Promise<void> {
    if (!hasDatabaseUrl()) return
    const db = getDb()
    await db
      .update(userProfiles)
      .set({ actorType: 'SYNTHETIC_TEST' })
      .where(eq(userProfiles.firebaseUid, userId))
      .catch(() => {})
  }

  async simulate(input: SyntheticSimulateInput): Promise<{ ok: true; results: string[] }> {
    assertSyntheticAllowed()
    await this.ensureSyntheticUser(input.userId)

    const actions = input.actions ?? ['feed_request', 'impression', 'dwell']
    const results: string[] = []
    const mode = PERSONA_MODES[input.persona]

    for (const action of actions) {
      switch (action) {
        case 'feed_request': {
          const page = await feedService.getFeed({
            userId: input.userId,
            sessionId: `synthetic-${input.persona}`,
            mode,
            limit: 10,
            citySlug: input.persona === 'LOCAL_NEWS_READER' ? 'istanbul' : null,
          })
          results.push(`feed_request:${page.items.length}`)
          break
        }
        case 'impression':
          await feedTelemetryService.recordBatch(input.userId, `synthetic-${input.persona}`, [
            {
              eventType: 'feed_impression',
              articleId: input.articleId ?? undefined,
              feedType: mode,
            },
          ])
          results.push('impression')
          break
        case 'dwell':
          await feedTelemetryService.recordBatch(input.userId, `synthetic-${input.persona}`, [
            {
              eventType: 'article_dwell',
              articleId: input.articleId ?? undefined,
              dwellMs: 4500,
              feedType: mode,
            },
          ])
          results.push('dwell')
          break
        case 'skip':
          await feedTelemetryService.recordBatch(input.userId, `synthetic-${input.persona}`, [
            { eventType: 'quick_skip', articleId: input.articleId ?? undefined, feedType: mode },
          ])
          results.push('skip')
          break
        case 'open':
          await feedTelemetryService.recordBatch(input.userId, `synthetic-${input.persona}`, [
            { eventType: 'article_opened', articleId: input.articleId ?? undefined, feedType: mode },
          ])
          results.push('open')
          break
        case 'follow':
          if (input.publisherId) {
            await recordSocialEvent({
              eventType: 'publisher_followed',
              userId: input.userId,
              targetType: 'publisher',
              targetId: input.publisherId,
              metadata: { synthetic: true, persona: input.persona },
            }).catch(() => {})
          }
          results.push('follow')
          break
        case 'like':
        case 'save':
        case 'share':
          if (input.articleId) {
            const eventType =
              action === 'like' ? 'article_liked' : action === 'save' ? 'article_saved' : 'article_shared'
            await recordSocialEvent({
              eventType,
              userId: input.userId,
              targetType: 'article',
              targetId: input.articleId,
              metadata: { synthetic: true, persona: input.persona },
            }).catch(() => {})
          }
          results.push(action)
          break
      }
    }

    return { ok: true, results }
  }
}

export const syntheticSimulatorService = new SyntheticSimulatorService()
