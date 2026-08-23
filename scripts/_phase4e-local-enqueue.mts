/**
 * Phase 4E — local enqueue against Neon (no paid provider call).
 * Usage: npx tsx scripts/_phase4e-local-enqueue.mts
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

async function main() {
  loadEnvLocal()
  const T4E = existsSync('tmp-phase4e-T4E.txt')
    ? readFileSync('tmp-phase4e-T4E.txt', 'utf8').trim()
    : '2026-08-21T09:31:23.000Z'
  process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
  process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
  process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = T4E
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_EVENTS = '2'
  process.env.CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS = '2'
  process.env.AI_MAX_COST_PER_EVENT_USD = '0.01'
  process.env.AI_MAX_DRAFTS_PER_HOUR = '2'
  process.env.AI_MAX_DRAFTS_PER_DAY = '10'
  process.env.AI_MAX_DAILY_COST_USD = '0.05'
  process.env.AI_MAX_MONTHLY_COST_USD = '5'
  process.env.DEEPSEEK_INPUT_COST_PER_1M = process.env.DEEPSEEK_INPUT_COST_PER_1M || '0.44'
  process.env.DEEPSEEK_OUTPUT_COST_PER_1M = process.env.DEEPSEEK_OUTPUT_COST_PER_1M || '1.32'
  process.env.DEEPSEEK_NEWS_MODEL = process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash'

  const { DrizzleCrawlerStore } = await import('../src/services/crawler/store/drizzle')
  const dispatchMod = await import('../src/services/crawler/aiDispatch/drizzleStore')
  const { runControlledAutoDraftTick } = await import('../src/services/crawler/autoDraft/pipeline')
  const { isControlledAutoDraftEnabled, getCrawlerAiMode } = await import('../src/services/crawler/aiMode')
  const { getCrawlerAiProviderReadiness } = await import('../src/services/crawler/aiDispatch/flags')

  const AiStore = (dispatchMod as any).DrizzleAiDispatchStore || (dispatchMod as any).default
  const crawlerStore = new DrizzleCrawlerStore()
  const aiStore = new AiStore()
  const pre = {
    mode: getCrawlerAiMode(),
    autoEnabled: isControlledAutoDraftEnabled(),
    providerReady: getCrawlerAiProviderReadiness().ready,
    providerReason: getCrawlerAiProviderReadiness().reason,
    credentialPresent: getCrawlerAiProviderReadiness().credentialPresent,
  }
  const result = await runControlledAutoDraftTick({ crawlerStore, aiStore, limit: 5 })
  const out = { pre, result }
  writeFileSync('tmp-phase4e-local-enqueue.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
