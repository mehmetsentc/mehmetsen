/**
 * Trigger production crawler tick (SHADOW only). Does not print secrets.
 * Usage: npx tsx scripts/_phase4f31-tick.mts
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
  if (!secret) {
    console.error('NO_CRON_SECRET')
    process.exit(1)
  }
  const n = Number(process.argv[2] || '1')
  for (let i = 1; i <= n; i++) {
    const res = await fetch('https://www.nahaber.com/api/cron/crawler/tick', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const text = await res.text()
    const path = `tmp-phase4f31-tick${i}.json`
    writeFileSync(path, text)
    let summary: Record<string, unknown> = { status: res.status, bytes: text.length }
    try {
      const j = JSON.parse(text) as Record<string, unknown>
      const ad = (j.autoDraft || {}) as Record<string, unknown>
      summary = {
        status: res.status,
        mode: ad.mode,
        jobsCreated: ad.jobsCreated,
        providerCalls: ad.providerCalls,
        shadowWouldDispatch: ad.shadowWouldDispatch,
        shadowWouldBlock: ad.shadowWouldBlock,
        aiRequests: j.aiRequests,
        sourcesChecked: j.sourcesChecked,
        articlesFetched: j.articlesFetched,
        articlesClustered: j.articlesClustered,
        clustersCreated: j.clustersCreated,
      }
    } catch {
      summary.nonJson = true
    }
    console.log(JSON.stringify(summary))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
