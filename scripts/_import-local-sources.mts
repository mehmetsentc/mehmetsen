import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LOCAL_CITY_SOURCE_REGISTRY,
  TURKEY_SOURCE_REGISTRY,
  turkeyRegistryToInsert,
} from '../src/services/crawler/turkeyRegistry'
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

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)

  const beforeCount = await sql`SELECT count(*)::int AS c FROM news_sources`
  const beforeLocal = await sql`
    SELECT count(*)::int AS c FROM news_sources
    WHERE geographic_scope IN ('CITY', 'DISTRICT')
      AND source_category = 'LOCAL'`

  const store = new DrizzleCrawlerStore()
  const existing = await store.listSources()
  const haveKey = new Set(existing.map((s) => s.registryKey).filter(Boolean) as string[])
  const haveDomain = new Set(existing.map((s) => s.domain.toLowerCase()))

  const seeded: Array<{ key: string; name: string; city?: string | null; id?: string }> = []
  const skipped: Array<{ key: string; reason: string }> = []

  for (const entry of LOCAL_CITY_SOURCE_REGISTRY) {
    if (haveKey.has(entry.key)) {
      skipped.push({ key: entry.key, reason: 'registry_key_exists' })
      continue
    }
    if (haveDomain.has(entry.domain.toLowerCase())) {
      skipped.push({ key: entry.key, reason: 'domain_exists' })
      continue
    }
    const inserted = await store.insertSource(turkeyRegistryToInsert(entry))
    seeded.push({ key: entry.key, name: entry.name, city: entry.city ?? null, id: inserted.id })
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

  const activated: Array<{ id: string; name: string; domain: string }> = []
  const alreadyActive: string[] = []
  const failed: Array<{ id: string; name: string; status: string; reason: string }> = []

  for (const s of localSources) {
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
      activated.push({ id: s.id, name: s.name, domain: s.domain })
    } catch (e) {
      failed.push({
        id: s.id,
        name: s.name,
        status: s.status,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const antalyaSources = await sql`
    SELECT name, domain, status::text, registry_key, geographic_scope::text, city
    FROM news_sources
    WHERE city = 'Antalya' AND source_category = 'LOCAL'
    ORDER BY name`

  const afterCount = await sql`SELECT count(*)::int AS c FROM news_sources`
  const afterLocalActive = await sql`
    SELECT count(*)::int AS c FROM news_sources
    WHERE geographic_scope IN ('CITY', 'DISTRICT')
      AND source_category = 'LOCAL'
      AND status = 'ACTIVE'`

  const report = {
    timestamp: new Date().toISOString(),
    registry: {
      nationalCount: TURKEY_SOURCE_REGISTRY.length - LOCAL_CITY_SOURCE_REGISTRY.length,
      localCityRegistryCount: LOCAL_CITY_SOURCE_REGISTRY.length,
      totalRegistryCount: TURKEY_SOURCE_REGISTRY.length,
    },
    before: {
      totalSources: beforeCount[0]?.c ?? 0,
      localSources: beforeLocal[0]?.c ?? 0,
    },
    seeded,
    skipped,
    activated,
    alreadyActiveCount: alreadyActive.length,
    failed,
    antalyaSources,
    after: {
      totalSources: afterCount[0]?.c ?? 0,
      localActive: afterLocalActive[0]?.c ?? 0,
    },
    counts: {
      newRegistryEntries: LOCAL_CITY_SOURCE_REGISTRY.length,
      seededToDb: seeded.length,
      skippedSeed: skipped.length,
      activated: activated.length,
      alreadyActive: alreadyActive.length,
      failed: failed.length,
    },
  }

  writeFileSync('tmp-import-local-sources.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.counts, null, 2))
  console.log('Antalya sample:', JSON.stringify(antalyaSources.slice(0, 8), null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
