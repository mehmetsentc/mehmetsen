/**
 * P18 — execute atomic single-pilot authorization transfer.
 *
 * Identity binding (required for --apply):
 *   A) P18_TRANSFER_ID_TOKEN / FIREBASE_ID_TOKEN → verifyIdToken → NEW uid
 *   B) --bind-super-admin-email (explicit human approval that continuous admin
 *      = currently authenticated Production account) → Admin getUserByEmail
 *
 * Never prints UID / email / tokens.
 *
 * Usage:
 *   npx tsx scripts/_p18_atomic_pilot_transfer.mts
 *   npx tsx scripts/_p18_atomic_pilot_transfer.mts --apply --bind-super-admin-email
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import {
  CONSUMER_PILOT_BUNDLE,
  PROGRAMMATIC_OPERATOR_PILOT_UID,
  assertPilotTransferGates,
  isPilotTransferAlreadyDone,
} from '../src/services/user/pilotAuthorizationTransfer'
import { exactUidMatch } from '../src/lib/feed/reader/exactUidMatch'
import { newUserId } from '../src/lib/user/id'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(resolve(stubDir, 'index.js'))) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
  void require
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
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
}

loadEnvLocal()
process.env.FEED_V2_READER_ENABLED = 'false'
process.env.FEED_V2_NFRANK_ENABLED = 'false'

const OLD = PROGRAMMATIC_OPERATOR_PILOT_UID
const BUNDLE = [...CONSUMER_PILOT_BUNDLE]
const HIST = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

function initAdmin() {
  const require = createRequire(import.meta.url)
  const { initializeApp, getApps, cert } = require('firebase-admin/app')
  const { getAuth } = require('firebase-admin/auth')
  function readSA() {
    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
    if (jsonRaw) {
      const parsed = JSON.parse(jsonRaw)
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }
    }
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID?.trim(),
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim(),
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim(),
    }
  }
  const sa = readSA()
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
      projectId: sa.projectId,
    })
  }
  return getAuth()
}

async function resolveNewUid(
  auth: ReturnType<typeof initAdmin>,
  opts: { allowSuperAdminEmail: boolean }
): Promise<{
  newUid: string
  source: 'bearer_token' | 'super_admin_email'
  providerGoogle: boolean
  disabled: boolean
  equalsHist: boolean
}> {
  const token =
    process.env.P18_TRANSFER_ID_TOKEN?.trim() || process.env.FIREBASE_ID_TOKEN?.trim() || ''
  if (token) {
    const decoded = await auth.verifyIdToken(token)
    const user = await auth.getUser(decoded.uid)
    return {
      newUid: decoded.uid,
      source: 'bearer_token',
      providerGoogle: (user.providerData ?? []).some(
        (p: { providerId: string }) => p.providerId === 'google.com'
      ),
      disabled: Boolean(user.disabled),
      equalsHist: exactUidMatch(decoded.uid, HIST),
    }
  }

  if (!opts.allowSuperAdminEmail) {
    throw new Error('NO_IDENTITY_BINDING')
  }

  const email = process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!email) {
    throw new Error('NO_IDENTITY_BINDING')
  }
  const user = await auth.getUserByEmail(email)
  return {
    newUid: user.uid,
    source: 'super_admin_email',
    providerGoogle: (user.providerData ?? []).some((p) => p.providerId === 'google.com'),
    disabled: Boolean(user.disabled),
    equalsHist: exactUidMatch(user.uid, HIST),
  }
}

async function loadKeys(sql: ReturnType<typeof neon>, uid: string) {
  const rows = await sql`
    SELECT feature_key FROM user_feature_access
    WHERE user_id = ${uid} AND enabled = true`
  return new Set(rows.map((r) => String(r.feature_key)))
}

async function pilotCounts(sql: ReturnType<typeof neon>) {
  const sf = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
    WHERE feature_key = 'SMART_FEED' AND enabled = true`
  const fr = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
    WHERE feature_key = 'FEED_READER_V1' AND enabled = true`
  const nf = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
    WHERE feature_key = 'NFRANK_V1' AND enabled = true`
  const owners = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
    WHERE feature_key = ANY(${['SMART_FEED', 'NFRANK_V1', 'FEED_READER_V1']})
      AND enabled = true`
  return {
    smartFeedCount: Number(sf[0]?.n ?? 0),
    feedReaderCount: Number(fr[0]?.n ?? 0),
    nfrankCount: Number(nf[0]?.n ?? 0),
    distinctPilotOwners: Number(owners[0]?.n ?? 0),
  }
}

async function featureCounts(sql: ReturnType<typeof neon>) {
  const rows = await sql`
    SELECT feature_key, COUNT(DISTINCT user_id)::int AS n
    FROM user_feature_access
    WHERE feature_key = ANY(${BUNDLE}) AND enabled = true
    GROUP BY 1 ORDER BY 1`
  return Object.fromEntries(rows.map((r) => [String(r.feature_key), Number(r.n)]))
}

async function ensureUserRow(
  sql: ReturnType<typeof neon>,
  auth: ReturnType<typeof initAdmin>,
  uid: string
) {
  const existing = await sql`SELECT firebase_uid FROM users WHERE firebase_uid = ${uid} LIMIT 1`
  if (existing.length > 0) return
  const user = await auth.getUser(uid)
  const email = user.email ?? `pilot_${uid.slice(0, 8)}@users.local`
  const username = `user_${uid.slice(0, 10)}`.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const displayName = user.displayName || username
  await sql`
    INSERT INTO users (firebase_uid, email, username, display_name, role, created_at, updated_at)
    VALUES (${uid}, ${email}, ${username}, ${displayName}, 'user', now(), now())
    ON CONFLICT (firebase_uid) DO NOTHING`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const allowSuperAdminEmail = process.argv.includes('--bind-super-admin-email')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ error: 'DATABASE_URL_missing' }))
    process.exit(1)
  }
  const sql = neon(url)
  const auth = initAdmin()

  let resolved
  try {
    resolved = await resolveNewUid(auth, { allowSuperAdminEmail })
  } catch (e) {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'CURRENT_AUTHENTICATED_ACCOUNT_COULD_NOT_BE_SAFELY_BOUND',
        detail: String((e as Error)?.message || e).slice(0, 80),
        hint: 'Provide Bearer via P18_TRANSFER_ID_TOKEN or pass --bind-super-admin-email',
      })
    )
    process.exit(2)
  }

  if (!resolved.providerGoogle || resolved.disabled || resolved.equalsHist) {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'NEW_IDENTITY_GATE_FAILED',
        providerGoogle: resolved.providerGoogle,
        disabled: resolved.disabled,
        equalsHist: resolved.equalsHist,
      })
    )
    process.exit(2)
  }
  if (exactUidMatch(resolved.newUid, OLD)) {
    console.log(JSON.stringify({ status: 'BLOCKED', reason: 'OLD_NEW_SAME' }))
    process.exit(2)
  }

  const oldKeys = await loadKeys(sql, OLD)
  const newKeys = await loadKeys(sql, resolved.newUid)
  const counts = await pilotCounts(sql)

  if (
    isPilotTransferAlreadyDone({
      oldEnabledKeys: oldKeys,
      newEnabledKeys: newKeys,
      smartFeedCount: counts.smartFeedCount,
      feedReaderCount: counts.feedReaderCount,
      nfrankCount: counts.nfrankCount,
    })
  ) {
    console.log(
      JSON.stringify({
        status: 'NO_OP_SUCCESS',
        identitySource: resolved.source,
        counts,
        featureCounts: await featureCounts(sql),
      })
    )
    return
  }

  const gates = assertPilotTransferGates({
    oldUid: OLD,
    newUid: resolved.newUid,
    oldEnabledKeys: oldKeys,
    newEnabledKeys: newKeys,
    smartFeedCount: counts.smartFeedCount,
    feedReaderCount: counts.feedReaderCount,
    nfrankCount: counts.nfrankCount,
    distinctPilotOwners: counts.distinctPilotOwners,
    newFirebaseValid: true,
    newDisabled: resolved.disabled,
  })

  if (!gates.ok) {
    console.log(JSON.stringify({ status: 'BLOCKED', reason: gates.reason, counts }))
    process.exit(2)
  }

  console.log(
    JSON.stringify({
      phase: 'preflight_ok',
      apply,
      identitySource: resolved.source,
      preCounts: counts,
      oldBundleSize: [...oldKeys].filter((k) => BUNDLE.includes(k as (typeof BUNDLE)[number])).length,
    })
  )

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, note: 'Pass --apply to execute atomic transfer' }))
    return
  }

  const transferId = randomUUID()
  const actor = 'system:p18-atomic-pilot-transfer'
  const reason = `P18 atomic single-pilot transfer ${transferId}`

  await ensureUserRow(sql, auth, resolved.newUid)

  try {
    await sql.transaction((txn) => {
      const stmts = []
      for (const featureKey of BUNDLE) {
        stmts.push(
          txn`
            UPDATE user_feature_access
            SET enabled = false, updated_at = now(), updated_by = ${actor}, reason = ${reason}
            WHERE user_id = ${OLD} AND feature_key = ${featureKey} AND enabled = true`
        )
      }
      for (const featureKey of BUNDLE) {
        const id = newUserId('ufa')
        stmts.push(
          txn`
            INSERT INTO user_feature_access
              (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
            VALUES
              (${id}, ${resolved.newUid}, ${featureKey}, true, ${actor}, ${actor}, ${reason}, now(), now())
            ON CONFLICT (user_id, feature_key)
            DO UPDATE SET
              enabled = true,
              updated_at = now(),
              updated_by = ${actor},
              reason = ${reason}`
        )
      }
      return stmts
    })
  } catch (e) {
    console.log(
      JSON.stringify({
        status: 'ROLLED_BACK',
        reason: 'TRANSACTION_FAILED',
        detail: String((e as Error)?.message || e).slice(0, 120),
      })
    )
    process.exit(3)
  }

  const afterOld = await loadKeys(sql, OLD)
  const afterNew = await loadKeys(sql, resolved.newUid)
  const afterCounts = await pilotCounts(sql)
  const afterFeatures = await featureCounts(sql)

  const oldClean = !BUNDLE.some((k) => afterOld.has(k))
  const newFull = BUNDLE.every((k) => afterNew.has(k))
  const countsOk =
    afterCounts.smartFeedCount === 1 &&
    afterCounts.feedReaderCount === 1 &&
    afterCounts.nfrankCount === 1 &&
    afterCounts.distinctPilotOwners === 1

  const { isFeedReaderEffectiveForUser, isSmartFeedEffectiveForUser } = await import(
    '../src/lib/user/effectiveUserFlags'
  )
  const readerNew = await isFeedReaderEffectiveForUser(resolved.newUid)
  const readerOld = await isFeedReaderEffectiveForUser(OLD)
  const smartNew = await isSmartFeedEffectiveForUser(resolved.newUid)

  const ok =
    oldClean && newFull && countsOk && readerNew === true && readerOld === false && smartNew === true

  console.log(
    JSON.stringify(
      {
        status: ok ? 'TRANSFERRED' : 'INVARIANT_FAILED',
        identitySource: resolved.source,
        transferId,
        oldClean,
        newFull,
        afterCounts,
        afterFeatures,
        readerNew,
        readerOld,
        smartNew,
        operatorFirebasePreserved: true,
      },
      null,
      2
    )
  )
  if (!ok) process.exit(4)
}

main().catch((e) => {
  console.log(JSON.stringify({ status: 'ERROR', detail: String(e?.message || e).slice(0, 160) }))
  process.exit(1)
})
