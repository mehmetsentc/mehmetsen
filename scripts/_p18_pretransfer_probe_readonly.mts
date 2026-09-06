/**
 * P18 — read-only pre-transfer probe. Never prints UID/email/tokens.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { neon } from '@neondatabase/serverless'

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

const OLD = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
const HIST = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
const BUNDLE = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
  'NFRANK_V1',
  'FEED_READER_V1',
] as const

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

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ error: 'DATABASE_URL_missing' }))
    process.exit(1)
  }
  const sql = neon(url)
  const auth = initAdmin()

  const oldKeys = (
    await sql`
      SELECT feature_key FROM user_feature_access
      WHERE user_id = ${OLD} AND enabled = true ORDER BY 1`
  ).map((r) => String(r.feature_key))
  const histKeys = (
    await sql`
      SELECT feature_key FROM user_feature_access
      WHERE user_id = ${HIST} AND enabled = true`
  ).map((r) => String(r.feature_key))

  const featureCounts: Record<string, number> = {}
  for (const k of BUNDLE) {
    const r = await sql`
      SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
      WHERE feature_key = ${k} AND enabled = true`
    featureCounts[k] = Number(r[0]?.n ?? 0)
  }
  const owners = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feature_access
    WHERE feature_key = ANY(${['SMART_FEED', 'NFRANK_V1', 'FEED_READER_V1']})
      AND enabled = true`

  const email = process.env.SUPER_ADMIN_EMAIL?.trim() || null
  let adminBind: Record<string, unknown> | null = null
  if (email) {
    try {
      const u = await auth.getUserByEmail(email)
      const adminKeys = (
        await sql`
          SELECT feature_key FROM user_feature_access
          WHERE user_id = ${u.uid} AND enabled = true`
      ).map((r) => String(r.feature_key))
      const usersRow = await sql`SELECT 1 FROM users WHERE firebase_uid = ${u.uid} LIMIT 1`
      adminBind = {
        found: true,
        equalsOld: u.uid === OLD,
        equalsHist: u.uid === HIST,
        disabled: Boolean(u.disabled),
        google: (u.providerData || []).some((p: { providerId: string }) => p.providerId === 'google.com'),
        providerCount: (u.providerData || []).length,
        hasUsersRow: usersRow.length > 0,
        adminEnabledBundleKeys: adminKeys.filter((k) => (BUNDLE as readonly string[]).includes(k)),
        adminEnabledBundleCount: adminKeys.filter((k) => (BUNDLE as readonly string[]).includes(k))
          .length,
      }
    } catch (e) {
      adminBind = { found: false, err: String((e as Error)?.message || e).slice(0, 80) }
    }
  }

  console.log(
    JSON.stringify(
      {
        oldBundleEnabled: oldKeys,
        oldHasFullBundle: BUNDLE.every((k) => oldKeys.includes(k)),
        histEnabledCount: histKeys.length,
        featureCounts,
        distinctPilotOwners: Number(owners[0]?.n ?? 0),
        superAdminEmailConfigured: Boolean(email),
        adminBind,
        bearerTokenPresent: Boolean(
          process.env.P18_TRANSFER_ID_TOKEN?.trim() || process.env.FIREBASE_ID_TOKEN?.trim()
        ),
        bootstrapUidsConfigured: Boolean(process.env.ADMIN_BOOTSTRAP_UIDS?.trim()),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e?.message || e).slice(0, 160) }))
  process.exit(1)
})
