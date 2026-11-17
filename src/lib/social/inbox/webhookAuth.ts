/**
 * Meta webhook authentication (server only, no I/O).
 *   GET  — hub.mode=subscribe + hub.verify_token must equal SOCIAL_META_WEBHOOK_VERIFY_TOKEN → echo hub.challenge
 *   POST — X-Hub-Signature-256: sha256=<HMAC-SHA256(raw body, App Secret)>; the Facebook app
 *          (Pages / Messenger / IG via Facebook Login) and the Instagram app (Instagram Login)
 *          have different secrets, so either may sign.
 */
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export function webhookSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.SOCIAL_FB_APP_SECRET, env.SOCIAL_IG_APP_SECRET].map((s) => s?.trim() ?? '').filter((s) => s.length > 0)
}

export function verifyChallenge(params: URLSearchParams, env: NodeJS.ProcessEnv = process.env): string | null {
  const expected = env.SOCIAL_META_WEBHOOK_VERIFY_TOKEN?.trim() ?? ''
  if (expected.length < 16) return null
  if (params.get('hub.mode') !== 'subscribe') return null
  const token = params.get('hub.verify_token') ?? ''
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const challenge = params.get('hub.challenge') ?? ''
  return /^[A-Za-z0-9_-]{1,200}$/.test(challenge) ? challenge : null
}

export function verifySignature(rawBody: string, header: string | null, secrets: readonly string[]): boolean {
  const m = /^sha256=([a-f0-9]{64})$/i.exec(header?.trim() ?? '')
  if (!m) return false
  const got = Buffer.from(m[1].toLowerCase(), 'hex')
  for (const secret of secrets) {
    const want = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
    if (want.length === got.length && timingSafeEqual(want, got)) return true
  }
  return false
}
