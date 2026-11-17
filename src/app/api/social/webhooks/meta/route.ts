/**
 * Meta webhooks for the social inbox (Instagram messages, Page / Messenger messages).
 *
 * GET  — subscription verification (hub.challenge echo, verify token from env).
 * POST — every payload must carry a valid X-Hub-Signature-256; unsigned or wrongly
 *        signed bodies are refused and nothing is stored. Valid payloads are
 *        stored (idempotent on message id) and answered with 200 quickly; drafts /
 *        auto replies run later in the shared worker, never inside this request.
 */
import { NextResponse } from 'next/server'
import { ingestMessagingWebhook } from '@/lib/social/inbox/store'
import { verifyChallenge, verifySignature, webhookSecrets } from '@/lib/social/inbox/webhookAuth'
import { socialLog } from '@/lib/social/safeLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY = 512 * 1024

export async function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url).searchParams)
  if (!challenge) return new NextResponse('forbidden', { status: 403 })
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const secrets = webhookSecrets()
  if (!secrets.length) return new NextResponse('not configured', { status: 503 })
  const raw = await request.text()
  if (raw.length > MAX_BODY) return new NextResponse('too large', { status: 413 })
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), secrets)) {
    socialLog('warn', 'cron', 'inbox_webhook_bad_signature', {})
    return new NextResponse('forbidden', { status: 403 })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new NextResponse('bad request', { status: 400 })
  }
  try {
    const r = await ingestMessagingWebhook(body, Date.now())
    socialLog('log', 'cron', 'inbox_webhook', { accepted: r.accepted, ignored: r.ignored, unknown: r.unknownAccounts })
  } catch (err) {
    // 500 → Meta retries the delivery; ingestion is idempotent on the message id, so a
    // retry never duplicates. Logged without payload.
    socialLog('error', 'cron', 'inbox_webhook_error', { error: err instanceof Error ? err.message.slice(0, 120) : 'unknown' })
    return new NextResponse('error', { status: 500 })
  }
  return new NextResponse('ok', { status: 200 })
}
