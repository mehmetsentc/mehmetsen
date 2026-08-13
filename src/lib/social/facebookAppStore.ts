/**
 * Per-site (BYO) Facebook App credentials — Firestore config/socialFacebookApps.
 *
 * Primary publisher site: onyeditivi (Onyeditivi Facebook Page).
 * App secret + custom page token are encrypted at rest (secretCrypto).
 * Never log secrets.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { decryptSecret, encryptSecret, hasSecretEncryptionKey } from '@/lib/crypto/secretCrypto'

export const SOCIAL_FACEBOOK_APPS_DOC = 'socialFacebookApps'
export const PRIMARY_FACEBOOK_SITE_ID = 'onyeditivi'

const CACHE_TTL_MS = 5 * 60 * 1000

export interface SiteFacebookAppStored {
  fbAppId?: string | null
  /** AES-GCM ciphertext — never return to clients */
  fbAppSecretEncrypted?: string | null
  fbAppName?: string | null
  fbPageId?: string | null
  /** Page token issued by this custom app (encrypted) */
  fbPageAccessTokenEncrypted?: string | null
  updatedAt?: unknown
  updatedBy?: string | null
}

export interface SiteFacebookAppPublic {
  siteId: string
  fbAppId: string | null
  fbAppName: string | null
  hasFbAppSecret: boolean
  fbPageId: string | null
  hasFbPageToken: boolean
  fbPageTokenPreview: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface FacebookAppsDoc {
  primarySiteId: string
  sites: Record<string, SiteFacebookAppStored>
}

interface CacheEntry {
  doc: FacebookAppsDoc
  fetchedAt: number
}

let _cache: CacheEntry | null = null

function emptyDoc(): FacebookAppsDoc {
  return { primarySiteId: PRIMARY_FACEBOOK_SITE_ID, sites: {} }
}

async function fetchDoc(): Promise<FacebookAppsDoc> {
  const db = getAdminFirestore()
  const snap = await db.collection('config').doc(SOCIAL_FACEBOOK_APPS_DOC).get()
  if (!snap.exists) return emptyDoc()
  const data = snap.data() ?? {}
  const sites = (data.sites as Record<string, SiteFacebookAppStored> | undefined) ?? {}
  const primarySiteId =
    (typeof data.primarySiteId === 'string' && data.primarySiteId.trim()) ||
    PRIMARY_FACEBOOK_SITE_ID
  return { primarySiteId, sites }
}

export function invalidateFacebookAppCache(): void {
  _cache = null
}

export async function getFacebookAppsDoc(force = false): Promise<FacebookAppsDoc> {
  const now = Date.now()
  if (!force && _cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.doc
  }
  try {
    const doc = await fetchDoc()
    _cache = { doc, fetchedAt: now }
    return doc
  } catch (err) {
    console.warn('[facebookAppStore] Firestore read failed:', err instanceof Error ? err.message : err)
    return emptyDoc()
  }
}

export async function getSiteFacebookApp(
  siteId: string = PRIMARY_FACEBOOK_SITE_ID,
): Promise<SiteFacebookAppStored | null> {
  const doc = await getFacebookAppsDoc()
  const id = siteId.trim() || doc.primarySiteId || PRIMARY_FACEBOOK_SITE_ID
  return doc.sites[id] ?? null
}

export function toPublicSiteApp(
  siteId: string,
  stored: SiteFacebookAppStored | null | undefined,
): SiteFacebookAppPublic {
  const s = stored ?? {}
  return {
    siteId,
    fbAppId: s.fbAppId?.trim() || null,
    fbAppName: s.fbAppName?.trim() || null,
    hasFbAppSecret: Boolean(s.fbAppSecretEncrypted?.trim()),
    fbPageId: s.fbPageId?.trim() || null,
    hasFbPageToken: Boolean(s.fbPageAccessTokenEncrypted?.trim()),
    fbPageTokenPreview: null,
    updatedAt:
      s.updatedAt && typeof (s.updatedAt as { toDate?: () => Date }).toDate === 'function'
        ? (s.updatedAt as { toDate: () => Date }).toDate().toISOString()
        : typeof s.updatedAt === 'string'
          ? s.updatedAt
          : null,
    updatedBy: s.updatedBy ?? null,
  }
}

export async function getDecryptedAppSecret(
  siteId: string = PRIMARY_FACEBOOK_SITE_ID,
): Promise<string | null> {
  const stored = await getSiteFacebookApp(siteId)
  const cipher = stored?.fbAppSecretEncrypted?.trim()
  if (!cipher) return null
  try {
    return await decryptSecret(cipher)
  } catch (err) {
    console.error(
      `[facebookAppStore] decrypt app secret failed site=${siteId}:`,
      err instanceof Error ? err.message : 'error',
    )
    return null
  }
}

export async function getDecryptedPageToken(
  siteId: string = PRIMARY_FACEBOOK_SITE_ID,
): Promise<string | null> {
  const stored = await getSiteFacebookApp(siteId)
  const cipher = stored?.fbPageAccessTokenEncrypted?.trim()
  if (!cipher) return null
  try {
    return await decryptSecret(cipher)
  } catch (err) {
    console.error(
      `[facebookAppStore] decrypt page token failed site=${siteId}:`,
      err instanceof Error ? err.message : 'error',
    )
    return null
  }
}

export interface UpsertSiteFacebookAppInput {
  siteId?: string
  fbAppId?: string | null
  fbAppSecret?: string | null
  fbAppName?: string | null
  fbPageId?: string | null
  fbPageAccessToken?: string | null
  clearSecret?: boolean
  clearPageToken?: boolean
  updatedBy?: string
}

export async function upsertSiteFacebookApp(
  input: UpsertSiteFacebookAppInput,
): Promise<SiteFacebookAppPublic> {
  const siteId = (input.siteId?.trim() || PRIMARY_FACEBOOK_SITE_ID).toLowerCase()
  const db = getAdminFirestore()
  const ref = db.collection('config').doc(SOCIAL_FACEBOOK_APPS_DOC)
  const existing = await getFacebookAppsDoc(true)
  const prev = existing.sites[siteId] ?? {}

  const next: SiteFacebookAppStored = { ...prev }

  if (input.fbAppId !== undefined) {
    next.fbAppId = input.fbAppId?.trim() || null
  }
  if (input.fbAppName !== undefined) {
    next.fbAppName = input.fbAppName?.trim() || null
  }
  if (input.fbPageId !== undefined) {
    next.fbPageId = input.fbPageId?.trim() || null
  }

  if (input.clearSecret) {
    next.fbAppSecretEncrypted = null
  } else if (input.fbAppSecret?.trim()) {
    if (!hasSecretEncryptionKey()) {
      throw new Error(
        'SECRET_ENCRYPTION_KEY (veya GMAIL_TOKEN_ENCRYPTION_KEY) tanımlı değil — App Secret şifrelenemedi',
      )
    }
    next.fbAppSecretEncrypted = await encryptSecret(input.fbAppSecret.trim())
  }

  if (input.clearPageToken) {
    next.fbPageAccessTokenEncrypted = null
  } else if (input.fbPageAccessToken?.trim()) {
    if (!hasSecretEncryptionKey()) {
      throw new Error(
        'SECRET_ENCRYPTION_KEY (veya GMAIL_TOKEN_ENCRYPTION_KEY) tanımlı değil — Page token şifrelenemedi',
      )
    }
    next.fbPageAccessTokenEncrypted = await encryptSecret(input.fbPageAccessToken.trim())
  }

  next.updatedAt = FieldValue.serverTimestamp()
  next.updatedBy = input.updatedBy ?? prev.updatedBy ?? null

  await ref.set(
    {
      primarySiteId: existing.primarySiteId || PRIMARY_FACEBOOK_SITE_ID,
      sites: {
        ...existing.sites,
        [siteId]: next,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  invalidateFacebookAppCache()
  return toPublicSiteApp(siteId, next)
}

export async function clearSiteFacebookApp(
  siteId: string = PRIMARY_FACEBOOK_SITE_ID,
  updatedBy?: string,
): Promise<void> {
  const id = (siteId.trim() || PRIMARY_FACEBOOK_SITE_ID).toLowerCase()
  const db = getAdminFirestore()
  const existing = await getFacebookAppsDoc(true)
  const sites = { ...existing.sites }
  delete sites[id]
  await db
    .collection('config')
    .doc(SOCIAL_FACEBOOK_APPS_DOC)
    .set(
      {
        primarySiteId: existing.primarySiteId || PRIMARY_FACEBOOK_SITE_ID,
        sites,
        updatedAt: FieldValue.serverTimestamp(),
        clearedBy: updatedBy ?? null,
      },
      { merge: true },
    )
  invalidateFacebookAppCache()
}
