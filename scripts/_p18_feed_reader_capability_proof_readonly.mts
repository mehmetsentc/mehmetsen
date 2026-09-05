/**
 * READ-ONLY — prove FEED_READER_V1 server resolution for exact pilot.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

const CANON = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(resolve(stubDir, 'index.js'))) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()
process.env.FEED_V2_READER_ENABLED = 'false'
process.env.FEED_V2_NFRANK_ENABLED = 'false'

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const rows = await sql`
    SELECT feature_key, enabled FROM user_feature_access
    WHERE user_id = ${CANON} AND enabled = true ORDER BY 1`
  const fr = await sql`
    SELECT COUNT(*)::int AS n FROM user_feature_access
    WHERE feature_key = 'FEED_READER_V1' AND enabled = true`

  const { userFeatureAccessService } = await import('../src/services/user/userFeatureAccessService')
  const { isFeedReaderEffectiveForUser, isSmartFeedEffectiveForUser } = await import(
    '../src/lib/user/effectiveUserFlags'
  )
  const { resolveFeatureForUser } = await import('../src/lib/user/userRolloutMatrix')
  const { isSmartFeedEnabled, isFeedReaderV1Enabled } = await import('../src/lib/feed/featureFlag')

  const keys = await userFeatureAccessService.getEnabledKeys(CANON)
  const resolved = resolveFeatureForUser({ featureKey: 'FEED_READER_V1', allowlistedKeys: keys })

  console.log(
    JSON.stringify(
      {
        smartFeedGlobal: isSmartFeedEnabled(),
        readerGlobal: isFeedReaderV1Enabled(),
        keys: [...keys].sort(),
        resolved,
        effectiveReader: await isFeedReaderEffectiveForUser(CANON),
        effectiveSmart: await isSmartFeedEffectiveForUser(CANON),
        effectiveReaderNull: await isFeedReaderEffectiveForUser(null),
        frCount: fr[0]?.n,
        keyRows: rows,
      },
      null,
      2
    )
  )
}
main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
