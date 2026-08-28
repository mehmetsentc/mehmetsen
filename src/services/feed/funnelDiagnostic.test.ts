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
  } catch {}
}
loadEnvLocal()

import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { signCmsSessionToken } from '@/lib/cmsSession'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedService } from './FeedService'

describe('P17.3A Live Browser Feed Diagnostic & Session Verification', () => {
  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

  it('1. verifyFirebaseIdToken: extracts uid from signed cms_session cookie when Bearer is missing', async () => {
    const sessionToken = await signCmsSessionToken({
      uid: pilotUid,
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const req = new Request('https://nahaber.com/api/feed/v2', {
      headers: {
        cookie: `cms_session=${sessionToken}; other=123`,
      },
    })

    const auth = await verifyFirebaseIdToken(req)
    expect(auth).not.toBeNull()
    expect(auth?.uid).toBe(pilotUid)
  })

  it('2. isSmartFeedEffectiveForUser: allows pilot user and rejects guest when global flag is off', async () => {
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

  it('3. feedService.getFeed: returns rich feed items for pilot user in personal mode', async () => {
    const feed = await feedService.getFeed({
      userId: pilotUid,
      sessionId: 'test_p17_3a_diagnostic',
      mode: 'personal',
    })

    expect(feed.items.length).toBeGreaterThan(0)
    expect(feed.mode).toBe('personal')
    expect(feed.items[0]).toHaveProperty('articleId')
    expect(feed.items[0]).toHaveProperty('headline')
  })
})
