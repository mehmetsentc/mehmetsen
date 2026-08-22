import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TURKEY_SOURCE_REGISTRY, turkeyRegistryToInsert } from '../src/services/crawler/turkeyRegistry'
import { DrizzleCrawlerStore } from '../src/services/crawler/store/drizzle'

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

function isLocalRegistryEntry(e: (typeof TURKEY_SOURCE_REGISTRY)[number]) {
  if (e.scope === 'NATIONAL') return false
  if (e.category === 'LOCAL' || e.category === 'PUBLIC') return true
  if ((e.scope === 'CITY' || e.scope === 'DISTRICT') && e.city) return true
  return false
}

function isLocalDbRow(s: {
  sourceCategory?: string | null
  geographicScope?: string | null
  city?: string | null
}) {
  const scope = s.geographicScope ?? 'NATIONAL'
  const cat = s.sourceCategory ?? ''
  if (scope === 'NATIONAL' && cat !== 'LOCAL' && cat !== 'PUBLIC') return false
  if (cat === 'AGENCY') return false
  if (cat === 'LOCAL' || cat === 'PUBLIC') return true
  if ((scope === 'CITY' || scope === 'DISTRICT') && s.city) return true
  return false
}

const KNOWN_RISKY: Record<string, string> = {
  'geliboluhaber.com': 'BLOCKED_EXTERNAL / SSRF risk (gelibolu)',
  'bianet.org': '403 / access block risk',
}

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)

  const beforeByStatus = await sql`
    SELECT status::text AS status, count(*)::int AS c FROM news_sources GROUP BY 1 ORDER BY 1`

  const beforeLocal = await sql`
    SELECT status::text AS status, count(*)::int AS c
    FROM news_sources
    WHERE (
      source_category IN ('LOCAL', 'PUBLIC')
      OR (geographic_scope IN ('CITY', 'DISTRICT') AND city IS NOT NULL)
    )
    AND geographic_scope != 'NATIONAL'
    AND (source_category IS NULL OR source_category != 'AGENCY')
    GROUP BY 1`

  const store = new DrizzleCrawlerStore()
  const existing = await store.listSources()
  const haveKey = new Set(existing.map((s) => s.registryKey).filter(Boolean) as string[])
  const haveDomain = new Set(existing.map((s) => s.domain.toLowerCase()))

  const seeded: Array<{ key: string; name: string; id?: string }> = []
  for (const entry of TURKEY_SOURCE_REGISTRY) {
    if (!isLocalRegistryEntry(entry)) continue
    if (haveKey.has(entry.key) || haveDomain.has(entry.domain.toLowerCase())) continue
    const inserted = await store.insertSource(turkeyRegistryToInsert(entry))
    seeded.push({ key: entry.key, name: entry.name, id: inserted.id })
    haveKey.add(entry.key)
    haveDomain.add(entry.domain.toLowerCase())
  }

  const allSources = await store.listSources()
  const localSources = allSources.filter((s) =>
    isLocalDbRow({
      sourceCategory: s.sourceCategory,
      geographicScope: s.geographicScope,
      city: s.city,
    })
  )

  const activated: Array<{ id: string; name: string; domain: string; warning?: string }> = []
  const alreadyActive: string[] = []
  const failed: Array<{ id: string; name: string; status: string; reason: string }> = []
  const warnings: string[] = []

  for (const s of localSources) {
    const domain = s.domain.toLowerCase()
    const risk = KNOWN_RISKY[domain]
    if (s.status === 'ACTIVE') {
      alreadyActive.push(s.name)
      continue
    }
    if (s.status === 'DISABLED') {
      failed.push({ id: s.id, name: s.name, status: s.status, reason: 'DISABLED — atlanıldı' })
      continue
    }
    try {
      await store.updateSource(s.id, { status: 'ACTIVE', lastPauseReason: null })
      const item = { id: s.id, name: s.name, domain: s.domain }
      if (risk) {
        warnings.push(`${s.name} (${domain}): ${risk}`)
        activated.push({ ...item, warning: risk })
      } else {
        activated.push(item)
      }
    } catch (e) {
      failed.push({
        id: s.id,
        name: s.name,
        status: s.status,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const afterByStatus = await sql`
    SELECT status::text AS status, count(*)::int AS c FROM news_sources GROUP BY 1 ORDER BY 1`

  const afterLocal = await sql`
    SELECT status::text AS status, count(*)::int AS c
    FROM news_sources
    WHERE (
      source_category IN ('LOCAL', 'PUBLIC')
      OR (geographic_scope IN ('CITY', 'DISTRICT') AND city IS NOT NULL)
    )
    AND geographic_scope != 'NATIONAL'
    AND (source_category IS NULL OR source_category != 'AGENCY')
    GROUP BY 1`

  const stillPausedLocal = await sql`
    SELECT name, domain, status::text, last_pause_reason
    FROM news_sources
    WHERE (
      source_category IN ('LOCAL', 'PUBLIC')
      OR (geographic_scope IN ('CITY', 'DISTRICT') AND city IS NOT NULL)
    )
    AND geographic_scope != 'NATIONAL'
    AND (source_category IS NULL OR source_category != 'AGENCY')
    AND status != 'ACTIVE'
    ORDER BY name`

  const report = {
    timestamp: new Date().toISOString(),
    before: { byStatus: beforeByStatus, localByStatus: beforeLocal },
    seeded,
    activated,
    alreadyActive,
    failed,
    warnings,
    stillPausedLocal,
    after: { byStatus: afterByStatus, localByStatus: afterLocal },
    counts: {
      activated: activated.length,
      seeded: seeded.length,
      alreadyActive: alreadyActive.length,
      failed: failed.length,
      stillPausedLocal: stillPausedLocal.length,
    },
  }

  writeFileSync('tmp-activate-local-sources.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
