/**
 * Phase 4F.4 — free preflight (no paid provider call).
 * Prints readiness + pricing + gate version. Never prints secrets.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getCrawlerAiProviderReadiness } from '../src/services/crawler/aiDispatch/providerReadiness'
import { getDeepSeekPricing } from '../src/lib/ai/usage/pricing'
import { getDeepSeekModel } from '../src/lib/ai/deepseekClient'
import { PRESPEND_GATE_VERSION_4F31 } from '../src/services/crawler/autoDraft/shadowUniqueEconomics'
import { acceptanceHardCaps } from '../src/services/crawler/autoDraft/activation'
import { autoDraftBudgetLimits } from '../src/services/crawler/autoDraft/budgetLimits'
import { blocksAutomaticRepay } from '../src/services/crawler/autoDraft/lease'
import { autoDraftMayPublish } from '../src/services/crawler/autoDraft/eligibility'

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

const model = getDeepSeekModel()
const pricing = getDeepSeekPricing(model)
const readiness = getCrawlerAiProviderReadiness()
const caps = acceptanceHardCaps()
const limits = autoDraftBudgetLimits()

const out = {
  at: new Date().toISOString(),
  note: 'Free preflight — no provider network call.',
  pricing: {
    inputPerMillionUsd: pricing.inputPerMillionUsd,
    outputPerMillionUsd: pricing.outputPerMillionUsd,
    expectedInput: 0.44,
    expectedOutput: 1.32,
    pricingOk:
      Math.abs((pricing.inputPerMillionUsd ?? -1) - 0.44) < 1e-9 &&
      Math.abs((pricing.outputPerMillionUsd ?? -1) - 1.32) < 1e-9,
  },
  model,
  credentialPresent: readiness.credentialPresent,
  writerAvailable: readiness.writerAvailable,
  validatorAvailable: readiness.validatorAvailable,
  costUnknown: !readiness.inputPricingKnown || !readiness.outputPricingKnown,
  prespendGateVersion: PRESPEND_GATE_VERSION_4F31,
  acceptanceCaps: caps,
  budgetLimits: limits,
  noRepayProbe: blocksAutomaticRepay({
    failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
    hasSuccessfulLedger: true,
  }),
  autoPublishAllowed: autoDraftMayPublish(),
  providerKillSwitch: readiness.killSwitchEnabled,
  statusLabelTr: readiness.statusLabelTr,
  notesTr: readiness.notesTr,
}

writeFileSync('tmp-phase4f4-preflight.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
if (out.costUnknown || !out.pricing.pricingOk) {
  console.error('PREFLIGHT_STOP')
  process.exit(2)
}
