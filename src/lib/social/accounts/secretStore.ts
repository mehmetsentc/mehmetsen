/**
 * Social account secrets — Firestore `socialAccountSecrets/{accountId}`.
 *
 * Two kinds:
 *   - `encrypted`: access token encrypted with the existing AES-256-GCM layer
 *     (`secretCrypto`, SECRET_ENCRYPTION_KEY). A missing key REJECTS the write;
 *     there is no plaintext fallback.
 *   - `legacy`: no token copied — a reference to the existing Onyeditivi
 *     credential source, resolved at publish time by resolvePublishTarget.
 *
 * Never log or return token values.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { decryptSecret, encryptSecret, hasSecretEncryptionKey } from '@/lib/crypto/secretCrypto'
import type { SocialAccountPlatform } from './types'

export {
  LEGACY_CREDENTIAL_SOURCES,
  parseSecretRecord,
  type EncryptedSecretRecord,
  type LegacyCredentialSource,
  type LegacySecretRecord,
  type SocialAccountSecretRecord,
  type SocialTokenType,
} from './secretStore.shared'
import {
  LEGACY_CREDENTIAL_SOURCES,
  parseSecretRecord,
  type EncryptedSecretRecord,
  type LegacyCredentialSource,
  type LegacySecretRecord,
  type SocialAccountSecretRecord,
  type SocialTokenType,
} from './secretStore.shared'

export class SecretEncryptionUnavailableError extends Error {
  readonly code = 'secret_encryption_unavailable'
  constructor() {
    super('SECRET_ENCRYPTION_KEY tanımlı değil — sosyal hesap sırrı kaydedilmedi (düz metin saklanmaz)')
  }
}

function secretsCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_ACCOUNT_SECRETS)
}

/** Build an encrypted record. Throws SecretEncryptionUnavailableError without a key. */
export async function buildEncryptedSecretRecord(
  accessToken: string,
  tokenType: SocialTokenType,
  now = Date.now(),
): Promise<EncryptedSecretRecord> {
  const token = accessToken.trim()
  if (!token) throw new Error('boş erişim anahtarı kaydedilemez')
  if (!hasSecretEncryptionKey()) throw new SecretEncryptionUnavailableError()
  const accessTokenEncrypted = await encryptSecret(token)
  if (!accessTokenEncrypted || accessTokenEncrypted.includes(token)) {
    throw new Error('şifreleme doğrulanamadı — sır kaydedilmedi')
  }
  return { kind: 'encrypted', accessTokenEncrypted, tokenType, updatedAt: now }
}

export function buildLegacySecretRecord(platform: SocialAccountPlatform, now = Date.now()): LegacySecretRecord {
  return { kind: 'legacy', legacySource: LEGACY_CREDENTIAL_SOURCES[platform], updatedAt: now }
}

export async function saveEncryptedAccessToken(
  accountId: string,
  accessToken: string,
  tokenType: SocialTokenType,
): Promise<void> {
  const record = await buildEncryptedSecretRecord(accessToken, tokenType)
  await secretsCol().doc(accountId).set(record)
}

export async function readSecretRecord(accountId: string): Promise<SocialAccountSecretRecord | null> {
  const snap = await secretsCol().doc(accountId).get()
  if (!snap.exists) return null
  return parseSecretRecord(snap.data())
}

/** Decrypt an encrypted record. Returns null on any failure (message never includes ciphertext). */
export async function decryptAccessToken(record: EncryptedSecretRecord): Promise<string | null> {
  try {
    const token = await decryptSecret(record.accessTokenEncrypted)
    return token.trim() || null
  } catch {
    return null
  }
}
