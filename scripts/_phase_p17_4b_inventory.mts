import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    const { mkdirSync, writeFileSync } = require('node:fs')
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
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

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== P17.4B STEP 1: READ-ONLY INVENTORY FIRST ===')

  // 1. Group by user_id
  const userSummary = await sql`
    SELECT
      user_id,
      count(*)::int as total_grants,
      count(*) FILTER (WHERE enabled = true)::int as active_grants,
      array_agg(feature_key ORDER BY feature_key) as all_features,
      array_agg(feature_key ORDER BY feature_key) FILTER (WHERE enabled = true) as active_features,
      min(created_at) as earliest_created_at,
      max(updated_at) as latest_updated_at,
      array_agg(DISTINCT reason) as reasons,
      array_agg(DISTINCT created_by) as creators,
      array_agg(DISTINCT updated_by) as updaters
    FROM user_feature_access
    GROUP BY user_id
    ORDER BY user_id
  `

  console.log(`Total distinct user_id in user_feature_access: ${userSummary.length}`)

  // 2. Query users table
  const allUsersInDb = await sql`
    SELECT firebase_uid, email, display_name, role, created_at
    FROM users
  `
  const userMap = new Map(allUsersInDb.map(u => [u.firebase_uid, u]))

  // 3. Try checking Firebase Auth
  let fbUsers: any[] = []
  try {
    const { getAdminAuth } = await import('../src/lib/firebase/admin')
    const adminAuth = getAdminAuth()
    const listUsersResult = await adminAuth.listUsers(1000)
    fbUsers = listUsersResult.users
    console.log(`Firebase Auth returned ${fbUsers.length} users.`)
  } catch (err: any) {
    console.warn(`Firebase Auth inspection warning: ${err.message}`)
  }
  const fbMap = new Map(fbUsers.map(u => [u.uid, u]))

  const detailedReport = []

  for (const row of userSummary) {
    const matchingDbUser = userMap.get(row.user_id)
    const matchingFbUser = fbMap.get(row.user_id)

    detailedReport.push({
      user_id: row.user_id,
      total_grants: row.total_grants,
      active_grants: row.active_grants,
      active_features: row.active_features || [],
      earliest_created_at: row.earliest_created_at,
      latest_updated_at: row.latest_updated_at,
      reasons: row.reasons,
      creators: row.creators,
      updaters: row.updaters,
      exists_in_pg_users: !!matchingDbUser,
      pg_user: matchingDbUser ? {
        firebase_uid: matchingDbUser.firebase_uid,
        email: matchingDbUser.email,
        display_name: matchingDbUser.display_name,
        role: matchingDbUser.role,
      } : null,
      exists_in_firebase_auth: !!matchingFbUser,
      fb_user: matchingFbUser ? {
        uid: matchingFbUser.uid,
        email: matchingFbUser.email,
        displayName: matchingFbUser.displayName,
      } : null,
    })
  }

  // Print overall totals
  const totalRows = (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c
  const activeRows = (await sql`SELECT count(*)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const uniqueActiveUsers = (await sql`SELECT count(DISTINCT user_id)::int as c FROM user_feature_access WHERE enabled = true`)[0].c

  const summary = {
    totalRows,
    activeRows,
    uniqueActiveUsers,
    distinctUserCount: userSummary.length,
    usersInPgUsers: detailedReport.filter(d => d.exists_in_pg_users).map(d => d.user_id),
    usersInFirebaseAuth: detailedReport.filter(d => d.exists_in_firebase_auth).map(d => d.user_id),
    sampleMalformedUids: detailedReport.filter(d => !d.exists_in_pg_users && !d.exists_in_firebase_auth).slice(0, 10).map(d => d.user_id),
    canonicalPilot: detailedReport.find(d => d.user_id === 'wG8WTNlW38TILLvpDLsFmt8IMlg1'),
    historicalPilot: detailedReport.find(d => d.user_id === 'ap3scBglLIVwflfZN4qL8PKrM1A3'),
  }

  console.log('\n--- SUMMARY ---')
  console.log(JSON.stringify(summary, null, 2))

  writeFileSync(
    resolve(process.cwd(), 'scripts/_phase_p17_4b_inventory_out.json'),
    JSON.stringify({ summary, detailedReport }, null, 2)
  )
  console.log('\nSaved full inventory to scripts/_phase_p17_4b_inventory_out.json')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
