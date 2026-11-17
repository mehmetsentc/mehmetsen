/**
 * Platform write calls for the social inbox (server only). Every call uses the
 * target account's own token from the shared resolver; tokens travel only in
 * the request body and never reach logs (metaRequest logs step + codes only).
 * See ./model.ts for the official endpoints and permissions.
 */
import 'server-only'
import { metaRequest, query, type MetaErrorInfo } from '../accounts/connect/metaHttp'
import type { PublishTarget } from '../accounts/targetTypes'
import { isUncertainFailure } from './model'

export type PlatformResult =
  | { ok: true; externalId: string | null; containerId?: string; pendingPublish?: boolean }
  | { ok: false; code: string; uncertain: boolean }

const idOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

function metaFail(e: MetaErrorInfo): PlatformResult {
  return { ok: false, code: `meta_${e.status}_${e.code ?? '-'}${e.subcode !== null ? `_${e.subcode}` : ''}`, uncertain: isUncertainFailure(e.status) }
}

async function metaPost(step: string, url: string, form: Record<string, string>, token: string) {
  return metaRequest<Record<string, unknown>>(step, url, { method: 'POST', form: { ...form, access_token: token } })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Threads recommends a short wait between container and publish (tests set 0). */
export const inboxTiming = { threadsPublishDelayMs: 3_000 }

// ── Comment reply ────────────────────────────────────────────────────────────

export async function replyToComment(target: PublishTarget, commentId: string, text: string): Promise<PlatformResult> {
  const id = encodeURIComponent(commentId)
  switch (target.platform) {
    case 'instagram': {
      const r = await metaPost('inbox.ig_reply', `${target.apiBase}/${id}/replies`, { message: text }, target.accessToken)
      return r.ok ? { ok: true, externalId: idOf(r.data.id) } : metaFail(r.error)
    }
    case 'facebook': {
      const r = await metaPost('inbox.fb_reply', `${target.apiBase}/${id}/comments`, { message: text }, target.accessToken)
      return r.ok ? { ok: true, externalId: idOf(r.data.id) } : metaFail(r.error)
    }
    case 'threads': {
      const c = await metaPost('inbox.th_container', `${target.apiBase}/me/threads`, { media_type: 'TEXT', text, reply_to_id: commentId }, target.accessToken)
      if (!c.ok) return metaFail(c.error)
      const containerId = idOf(c.data.id)
      if (!containerId) return { ok: false, code: 'threads_no_container', uncertain: true }
      await sleep(inboxTiming.threadsPublishDelayMs)
      const p = await publishThreadsContainer(target, containerId)
      // Not ready yet → the shared worker publishes it later (never a second container).
      if (!p.ok && !p.uncertain) return { ok: true, externalId: null, containerId, pendingPublish: true }
      return p.ok ? { ...p, containerId } : p
    }
    case 'youtube': {
      try {
        const res = await fetch(`${target.apiBase}/comments?part=snippet`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${target.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
          signal: AbortSignal.timeout(15_000),
          cache: 'no-store',
        })
        const body = (await res.json().catch(() => null)) as { id?: string; error?: { errors?: Array<{ reason?: string }> } } | null
        if (!res.ok) {
          const reason = body?.error?.errors?.[0]?.reason ?? '-'
          console.warn(`[social-inbox] youtube reply failed status=${res.status} reason=${reason}`)
          return { ok: false, code: `yt_${res.status}_${reason}`, uncertain: isUncertainFailure(res.status) }
        }
        return { ok: true, externalId: idOf(body?.id) }
      } catch {
        return { ok: false, code: 'yt_0_network', uncertain: true }
      }
    }
    case 'tiktok':
      return { ok: false, code: 'unsupported', uncertain: false }
  }
}

export async function publishThreadsContainer(target: PublishTarget, containerId: string): Promise<PlatformResult> {
  if (target.platform !== 'threads') return { ok: false, code: 'unsupported', uncertain: false }
  const r = await metaPost('inbox.th_publish', `${target.apiBase}/${encodeURIComponent(target.threadsUserId)}/threads_publish`, { creation_id: containerId }, target.accessToken)
  return r.ok ? { ok: true, externalId: idOf(r.data.id) } : metaFail(r.error)
}

// ── Hide ─────────────────────────────────────────────────────────────────────

export async function setCommentHidden(target: PublishTarget, commentId: string, hidden: boolean): Promise<PlatformResult> {
  const id = encodeURIComponent(commentId)
  const v = hidden ? 'true' : 'false'
  let r
  if (target.platform === 'instagram') r = await metaPost('inbox.ig_hide', `${target.apiBase}/${id}`, { hide: v }, target.accessToken)
  else if (target.platform === 'facebook') r = await metaPost('inbox.fb_hide', `${target.apiBase}/${id}`, { is_hidden: v }, target.accessToken)
  else if (target.platform === 'threads') r = await metaPost('inbox.th_hide', `${target.apiBase}/${id}/manage_reply`, { hide: v }, target.accessToken)
  else return { ok: false, code: 'unsupported', uncertain: false }
  return r.ok ? { ok: true, externalId: null } : metaFail(r.error)
}

// ── Direct messages ──────────────────────────────────────────────────────────

/**
 * Send API. `humanAgent` = a person answers 24 h–7 d after the user's last
 * message (Messenger / Instagram HUMAN_AGENT tag); the platform decides whether
 * the app may use it and its refusal is shown as is.
 */
export async function sendDirectMessage(target: PublishTarget, recipientId: string, text: string, opts: { humanAgent: boolean }): Promise<PlatformResult> {
  const form: Record<string, string> = {
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify({ text }),
  }
  if (opts.humanAgent) {
    form.messaging_type = 'MESSAGE_TAG'
    form.tag = 'HUMAN_AGENT'
  } else form.messaging_type = 'RESPONSE'
  let url: string
  if (target.platform === 'instagram') {
    url = target.connectionMethod === 'instagram_login' ? `${target.apiBase}/${encodeURIComponent(target.igUserId)}/messages` : `${target.apiBase}/me/messages`
  } else if (target.platform === 'facebook') url = `${target.apiBase}/${encodeURIComponent(target.pageId)}/messages`
  else return { ok: false, code: 'unsupported', uncertain: false }
  const r = await metaPost(`inbox.${target.platform === 'facebook' ? 'fb' : 'ig'}_send`, url, form, target.accessToken)
  return r.ok ? { ok: true, externalId: idOf(r.data.message_id) } : metaFail(r.error)
}

/** Turn on the `messages` webhook for this account (Instagram professional account or Page). */
export async function subscribeMessageWebhooks(target: PublishTarget, linkedPageId: string | null): Promise<PlatformResult> {
  let url: string
  if (target.platform === 'instagram' && target.connectionMethod === 'instagram_login') url = `${target.apiBase}/me/subscribed_apps`
  else if (target.platform === 'instagram' && linkedPageId) url = `${target.apiBase}/${encodeURIComponent(linkedPageId)}/subscribed_apps`
  else if (target.platform === 'facebook') url = `${target.apiBase}/${encodeURIComponent(target.pageId)}/subscribed_apps`
  else return { ok: false, code: 'unsupported', uncertain: false }
  const r = await metaPost('inbox.subscribe', url, { subscribed_fields: 'messages' }, target.accessToken)
  return r.ok && r.data.success !== false ? { ok: true, externalId: null } : r.ok ? { ok: false, code: 'subscribe_refused', uncertain: false } : metaFail(r.error)
}

/** Best effort: the sender's public name / username (shown in the inbox). Null when not allowed. */
export async function fetchSenderProfile(target: PublishTarget, senderId: string): Promise<{ name: string | null; username: string | null }> {
  if (target.platform !== 'instagram' && target.platform !== 'facebook') return { name: null, username: null }
  const fields = target.platform === 'instagram' ? 'name,username' : 'name'
  const r = await metaRequest<{ name?: unknown; username?: unknown }>('inbox.sender', query(`${target.apiBase}/${encodeURIComponent(senderId)}`, { fields, access_token: target.accessToken }))
  if (!r.ok) return { name: null, username: null }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null)
  return { name: s(r.data.name), username: s(r.data.username) }
}
