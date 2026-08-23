/**
 * Phase 4D.1 — local provider readiness probe (no paid call).
 * Usage: npx tsx scripts/_phase4d1-provider-preflight.mts
 */
import { readFileSync, existsSync } from 'node:fs'
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

async function main() {
  loadEnvLocal()
  process.env.CRAWLER_AI_PROVIDER_ENABLED = 'true'
  const { getCrawlerAiProviderReadiness } = await import(
    '../src/services/crawler/aiDispatch/providerReadiness'
  )
  const r = getCrawlerAiProviderReadiness()
  console.log(
    JSON.stringify(
      {
        providerReady: r.ready,
        reason: r.reason,
        statusLabelTr: r.statusLabelTr,
        credentialPresent: r.credentialPresent,
        model: r.model,
        inputPricingKnown: r.inputPricingKnown,
        outputPricingKnown: r.outputPricingKnown,
        writerAvailable: r.writerAvailable,
        validatorAvailable: r.validatorAvailable,
        notesTr: r.notesTr,
        paidCallDuringReadiness: false,
      },
      null,
      2
    )
  )
  delete process.env.CRAWLER_AI_PROVIDER_ENABLED
  const off = getCrawlerAiProviderReadiness()
  console.log(
    JSON.stringify({
      defaultKillSwitch: { ready: off.ready, reason: off.reason, status: off.statusLabelTr },
    })
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
