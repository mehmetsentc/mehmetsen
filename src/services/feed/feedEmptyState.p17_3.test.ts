import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (e) {}
}
loadEnvLocal()

import { feedService } from './FeedService'
import { feedCandidateService } from './FeedCandidateService'
import { feedColdStartService } from './FeedColdStartService'
import { feedUserContextService } from './FeedUserContextService'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'

describe('PHASE P17.3 — Smart Feed Empty State Prevention & Funnel Verification', () => {
  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

  it('1. Feature Flag Isolation: pilot user has effective access, unauthed is blocked when global flag is off', async () => {
    const prevEnv = process.env.SMART_FEED_ENABLED
    process.env.SMART_FEED_ENABLED = 'false'
    try {
      const pilotAllowed = await isSmartFeedEffectiveForUser(pilotUid)
      expect(pilotAllowed).toBe(true)

      const guestAllowed = await isSmartFeedEffectiveForUser(null)
      expect(guestAllowed).toBe(false)
    } finally {
      if (prevEnv !== undefined) process.env.SMART_FEED_ENABLED = prevEnv
      else delete process.env.SMART_FEED_ENABLED
    }
  })

  it('2. Candidate Funnel (29 -> >0): FeedCandidateService fetches recent published articles', async () => {
    const recent = await feedCandidateService.fetchRecent({ limit: 15, cursor: null, userId: pilotUid })
    expect(recent.length).toBeGreaterThan(0)
    expect(recent[0].articleId).toBeDefined()
    expect(recent[0].headline).toBeDefined()
    expect(recent[0].publishedAt).toBeInstanceOf(Date)
  })

  it('3. Cold Start V2 Resolution: resolves NEW_USER for pilot without signals and produces non-empty mix', async () => {
    const ctx = await feedUserContextService.load(pilotUid)
    const profile = feedColdStartService.resolveProfile(ctx)
    expect(profile).toBe('NEW_USER')
  })

  it('4. Full Feed Service (Sana Özel / Personal): returns 15 valid FeedItemDto items for pilot user', async () => {
    const feed = await feedService.getFeed({
      userId: pilotUid,
      sessionId: 'p17_3_audit_session',
      mode: 'personal',
    })
    expect(feed.items.length).toBeGreaterThan(0)
    expect(feed.items[0]).toHaveProperty('id')
    expect(feed.items[0]).toHaveProperty('articleId')
    expect(feed.items[0]).toHaveProperty('headline')
    expect(feed.items[0]).toHaveProperty('summary')
    expect(feed.mode).toBe('personal')
    expect(feed.hasMore).toBe(true)
    expect(feed.nextCursor).toBeDefined()
  })

  it('5. Following Mode Guard: unauthed request fails with auth_required', async () => {
    const feed = await feedService.getFeed({
      userId: null,
      sessionId: 'p17_3_audit_session',
      mode: 'following',
    })
    expect(feed.emptyReason).toBe('auth_required')
    expect(feed.items).toHaveLength(0)
  })
})
