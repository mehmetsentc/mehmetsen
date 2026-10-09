/**
 * Social account metadata store — Firestore `socialAccounts/{accountId}`.
 * Metadata only; secrets live in secretStore.ts. Admin SDK, server-only.
 *
 * No list caching and no listeners: reads happen on explicit admin/publish
 * actions only (cost rule: no continuous Firestore scans).
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  parseSocialAccount,
  type SocialAccount,
  type SocialAccountStatus,
} from './types'

const ACCOUNT_ID_RE = /^(facebook|instagram|threads)_[0-9A-Za-z_-]{1,64}$/

export function isWellFormedAccountId(id: unknown): id is string {
  return typeof id === 'string' && ACCOUNT_ID_RE.test(id)
}

function accountsCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS)
}

export type LoadedSocialAccount =
  | { state: 'missing' }
  | { state: 'invalid' }
  | { state: 'ok'; account: SocialAccount }

export async function loadSocialAccount(accountId: string): Promise<LoadedSocialAccount> {
  if (!isWellFormedAccountId(accountId)) return { state: 'invalid' }
  const snap = await accountsCol().doc(accountId).get()
  if (!snap.exists) return { state: 'missing' }
  const account = parseSocialAccount(accountId, snap.data())
  return account ? { state: 'ok', account } : { state: 'invalid' }
}

export async function getSocialAccount(accountId: string): Promise<SocialAccount | null> {
  const loaded = await loadSocialAccount(accountId)
  return loaded.state === 'ok' ? loaded.account : null
}

/**
 * Create the account document only if it does not exist (atomic `create`).
 * Returns 'created' or 'exists' — never overwrites an existing record.
 */
export async function createSocialAccountIfAbsent(account: SocialAccount): Promise<'created' | 'exists'> {
  if (!parseSocialAccount(account.id, account)) throw new Error('geçersiz hesap kaydı')
  try {
    await accountsCol().doc(account.id).create({ ...account })
    return 'created'
  } catch (err) {
    if (isAlreadyExists(err)) return 'exists'
    throw err
  }
}

export async function setSocialAccountStatus(
  accountId: string,
  status: SocialAccountStatus,
  input: { reason?: string | null; updatedBy: string | null; now?: number },
): Promise<void> {
  if (!isWellFormedAccountId(accountId)) throw new Error('geçersiz hesap kimliği')
  await accountsCol().doc(accountId).update({
    status,
    statusReason: input.reason ?? null,
    updatedBy: input.updatedBy,
    updatedAt: input.now ?? Date.now(),
  })
}

export function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown }
  return e?.code === 6 || e?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(e?.message ?? ''))
}
