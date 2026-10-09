/**
 * Secret record shapes + legacy source names (no crypto, no Firestore).
 * Shared by secretStore.ts (server) and the migration plan builder.
 */
import type { SocialAccountPlatform } from './types'

export const LEGACY_CREDENTIAL_SOURCES = {
  facebook: 'onyeditivi_facebook_page',
  instagram: 'onyeditivi_instagram_legacy',
  threads: 'onyeditivi_threads_env',
} as const satisfies Record<SocialAccountPlatform, string>

export type LegacyCredentialSource = (typeof LEGACY_CREDENTIAL_SOURCES)[SocialAccountPlatform]

export type SocialTokenType = 'facebook_page' | 'instagram_user' | 'threads_user'

export interface EncryptedSecretRecord {
  kind: 'encrypted'
  accessTokenEncrypted: string
  tokenType: SocialTokenType
  updatedAt: number
}

export interface LegacySecretRecord {
  kind: 'legacy'
  legacySource: LegacyCredentialSource
  updatedAt: number
}

export type SocialAccountSecretRecord = EncryptedSecretRecord | LegacySecretRecord

export function parseSecretRecord(raw: unknown): SocialAccountSecretRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0
  if (r.kind === 'encrypted') {
    const c = typeof r.accessTokenEncrypted === 'string' ? r.accessTokenEncrypted.trim() : ''
    const t = r.tokenType
    if (!c || (t !== 'facebook_page' && t !== 'instagram_user' && t !== 'threads_user')) return null
    return { kind: 'encrypted', accessTokenEncrypted: c, tokenType: t, updatedAt }
  }
  if (r.kind === 'legacy') {
    const src = r.legacySource
    if (!(Object.values(LEGACY_CREDENTIAL_SOURCES) as string[]).includes(src as string)) return null
    return { kind: 'legacy', legacySource: src as LegacyCredentialSource, updatedAt }
  }
  return null
}
