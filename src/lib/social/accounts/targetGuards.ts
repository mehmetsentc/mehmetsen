/**
 * Runtime guards used by platform publishers when an explicit target is given.
 * An invalid target is a hard stop — publishers never fall back to Onyeditivi.
 */
import { apiBaseFor } from './apiHosts'
import { isValidExternalId } from './types'
import type { FacebookPublishTarget, InstagramPublishTarget, ThreadsPublishTarget } from './targetTypes'

export const INVALID_TARGET_ERROR =
  'Hedef hesap geçersiz — yayın yapılmadı (başka hesaba geri düşülmez)'

function hasToken(t: { accessToken?: unknown }): boolean {
  return typeof t.accessToken === 'string' && t.accessToken.trim().length > 0
}

export function isUsableFacebookTarget(t: unknown): t is FacebookPublishTarget {
  const x = t as FacebookPublishTarget | null
  return (
    !!x &&
    x.platform === 'facebook' &&
    isValidExternalId(x.pageId) &&
    hasToken(x) &&
    apiBaseFor('facebook', x.connectionMethod) === x.apiBase
  )
}

export function isUsableInstagramTarget(t: unknown): t is InstagramPublishTarget {
  const x = t as InstagramPublishTarget | null
  return (
    !!x &&
    x.platform === 'instagram' &&
    isValidExternalId(x.igUserId) &&
    hasToken(x) &&
    apiBaseFor('instagram', x.connectionMethod) === x.apiBase
  )
}

export function isUsableThreadsTarget(t: unknown): t is ThreadsPublishTarget {
  const x = t as ThreadsPublishTarget | null
  return (
    !!x &&
    x.platform === 'threads' &&
    isValidExternalId(x.threadsUserId) &&
    hasToken(x) &&
    apiBaseFor('threads', x.connectionMethod) === x.apiBase
  )
}
