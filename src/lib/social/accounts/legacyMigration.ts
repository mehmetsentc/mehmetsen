/**
 * Legacy (Onyeditivi) → socialAccounts migration plan.
 *
 * - Pure plan builder: takes platform ids + credential PRESENCE flags only.
 *   Token values never enter this module.
 * - New records reference the legacy credential source (kind: 'legacy');
 *   nothing is copied in plain text.
 * - Deterministic ids (`${platform}_${externalId}`) + transactional create:
 *   re-running never duplicates or overwrites.
 * - Missing ids are reported, never invented.
 */
import { Collections } from '@/lib/firebase/collections'
import {
  accountIdFor,
  isValidExternalId,
  type SocialAccount,
  type SocialAccountOwnership,
  type SocialAccountPlatform,
} from './types'
import { LEGACY_CREDENTIAL_SOURCES, type LegacySecretRecord } from './secretStore.shared'

export interface LegacyIdSource {
  value: string | null
  /** Where the id was read from (env var name / Firestore path). Never a value. */
  source: string
}

export interface LegacyMigrationInput {
  facebookPageId: LegacyIdSource
  instagramUserId: LegacyIdSource
  threadsUserId: LegacyIdSource
  /** Whether a usable legacy credential exists for each platform (booleans only). */
  credentialPresent: Record<SocialAccountPlatform, boolean>
  ownership: SocialAccountOwnership
  actor: string
  now: number
  /** Ids already in socialAccounts (when Firestore was read); null = not checked. */
  existingAccountIds: Set<string> | null
}

export type PlanItem =
  | {
      platform: SocialAccountPlatform
      action: 'create'
      accountId: string
      idSource: string
      account: SocialAccount
      secret: LegacySecretRecord
      warnings: string[]
    }
  | { platform: SocialAccountPlatform; action: 'exists'; accountId: string; idSource: string; warnings: string[] }
  | { platform: SocialAccountPlatform; action: 'skip'; reason: string; idSource: string }

export interface LegacyMigrationPlan {
  items: PlanItem[]
  problems: string[]
  existingChecked: boolean
}

const DISPLAY_NAMES: Record<SocialAccountPlatform, string> = {
  facebook: 'Onyeditivi (Facebook)',
  instagram: 'Onyeditivi (Instagram)',
  threads: 'Onyeditivi (Threads)',
}

function buildAccount(
  platform: SocialAccountPlatform,
  externalId: string,
  input: LegacyMigrationInput,
  active: boolean,
): SocialAccount {
  const common = {
    id: accountIdFor(platform, externalId),
    externalId,
    displayName: DISPLAY_NAMES[platform],
    username: null,
    ownership: { ...input.ownership },
    status: active ? ('active' as const) : ('paused' as const),
    statusReason: active ? null : 'Legacy kimlik bilgisi yapılandırılmamış (geçiş sırasında)',
    connectedBy: input.actor,
    connectedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    updatedBy: input.actor,
    tokenExpiresAt: null,
    tokenExpiryVerified: false,
    grantedPermissions: null,
    permissionsVerifiedAt: null,
    platformAccountType: null,
    connectionMethod: 'legacy' as const,
  }
  if (platform === 'facebook') return { ...common, platform, facebook: { pageId: externalId } }
  if (platform === 'instagram') {
    return { ...common, platform, instagram: { igUserId: externalId, linkedFacebookPageId: null } }
  }
  return { ...common, platform, threads: { threadsUserId: externalId } }
}

export function buildLegacyMigrationPlan(input: LegacyMigrationInput): LegacyMigrationPlan {
  const problems: string[] = []
  const items: PlanItem[] = []
  if (!input.ownership.citySlug && !input.ownership.publisherId) {
    problems.push('Sahiplik (il veya yayıncı) belirtilmedi — plan oluşturulmadı')
    return { items, problems, existingChecked: input.existingAccountIds !== null }
  }

  const ids: Record<SocialAccountPlatform, LegacyIdSource> = {
    facebook: input.facebookPageId,
    instagram: input.instagramUserId,
    threads: input.threadsUserId,
  }

  for (const platform of ['facebook', 'instagram', 'threads'] as const) {
    const { value, source } = ids[platform]
    const externalId = value?.trim() || ''
    if (!externalId) {
      items.push({ platform, action: 'skip', reason: `Hesap kimliği yapılandırılmamış (${source})`, idSource: source })
      problems.push(`${platform}: hesap kimliği yok (${source}) — kayıt oluşturulmadı`)
      continue
    }
    if (!isValidExternalId(externalId)) {
      items.push({ platform, action: 'skip', reason: `Hesap kimliği biçimi geçersiz (${source})`, idSource: source })
      problems.push(`${platform}: hesap kimliği biçimi geçersiz (${source})`)
      continue
    }
    const accountId = accountIdFor(platform, externalId)
    const warnings: string[] = []
    if (!input.credentialPresent[platform]) {
      warnings.push('Legacy erişim anahtarı yapılandırılmamış — kayıt "paused" oluşturulur')
    }
    if (input.existingAccountIds?.has(accountId)) {
      items.push({ platform, action: 'exists', accountId, idSource: source, warnings })
      continue
    }
    items.push({
      platform,
      action: 'create',
      accountId,
      idSource: source,
      account: buildAccount(platform, externalId, input, input.credentialPresent[platform]),
      secret: { kind: 'legacy', legacySource: LEGACY_CREDENTIAL_SOURCES[platform], updatedAt: input.now },
      warnings,
    })
  }
  return { items, problems, existingChecked: input.existingAccountIds !== null }
}

/** Minimal Firestore surface used by applyLegacyMigrationPlan (Admin SDK compatible). */
export interface MigrationFirestore {
  collection(name: string): { doc(id: string): unknown }
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ exists: boolean }>
    create(ref: unknown, data: Record<string, unknown>): unknown
  }) => Promise<T>): Promise<T>
}

export type ApplyResult = { accountId: string; result: 'created' | 'exists' }

/** Writes ONLY 'create' items; an existing account (or secret) is never overwritten. */
export async function applyLegacyMigrationPlan(
  db: MigrationFirestore,
  plan: LegacyMigrationPlan,
): Promise<ApplyResult[]> {
  const out: ApplyResult[] = []
  for (const item of plan.items) {
    if (item.action !== 'create') continue
    const accountRef = db.collection(Collections.SOCIAL_ACCOUNTS).doc(item.accountId)
    const secretRef = db.collection(Collections.SOCIAL_ACCOUNT_SECRETS).doc(item.accountId)
    const result = await db.runTransaction(async (tx) => {
      const [acc, sec] = [await tx.get(accountRef), await tx.get(secretRef)]
      if (acc.exists || sec.exists) return 'exists' as const
      tx.create(accountRef, { ...item.account })
      tx.create(secretRef, { ...item.secret })
      return 'created' as const
    })
    out.push({ accountId: item.accountId, result })
  }
  return out
}

/** Printable plan — ids masked to the last 4 characters, no credential data. */
export function describePlan(plan: LegacyMigrationPlan): string[] {
  const mask = (id: string) => (id.length <= 4 ? '****' : `…${id.slice(-4)}`)
  const lines: string[] = []
  for (const it of plan.items) {
    if (it.action === 'skip') {
      lines.push(`[ATLA]   ${it.platform}: ${it.reason}`)
      continue
    }
    const ext = it.accountId.slice(it.platform.length + 1)
    const tag = it.action === 'create' ? '[OLUŞTUR]' : '[MEVCUT]'
    lines.push(`${tag} ${it.platform}: ${it.platform}_${mask(ext)} (kimlik kaynağı: ${it.idSource})`)
    if (it.action === 'create') {
      lines.push(`         durum=${it.account.status} yöntem=legacy sır=legacy-referans(${it.secret.legacySource})`)
    }
    for (const w of it.warnings) lines.push(`         uyarı: ${w}`)
  }
  if (!plan.existingChecked) lines.push('Not: mevcut kayıtlar okunmadı; yazma sırasında create() mükerrer kaydı yine engeller.')
  return lines
}
