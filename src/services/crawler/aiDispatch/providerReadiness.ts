/**
 * Phase 4D.1 — provider readiness (independent of AI mode).
 * Kill switch OFF by default. Key alone ≠ permission to spend.
 */

import { getDeepSeekApiKey, getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import { validateCanaryDraft } from '../canary/validate'
import { buildCanarySystemPrompt, buildCanaryUserPrompt } from '../canary/prompt'
import { createDeepSeekCanaryProvider } from '../canary/provider'

export const PROVIDER_NOT_READY_REASONS = [
  'PROVIDER_DISABLED',
  'MISSING_CREDENTIAL',
  'MISSING_MODEL',
  'COST_UNKNOWN',
  'WRITER_UNAVAILABLE',
  'VALIDATOR_UNAVAILABLE',
] as const

export type ProviderNotReadyReason = (typeof PROVIDER_NOT_READY_REASONS)[number]

export type CrawlerAiProviderReadiness = {
  ready: boolean
  reason: ProviderNotReadyReason | null
  killSwitchEnabled: boolean
  credentialPresent: boolean
  model: string | null
  inputPricingKnown: boolean
  outputPricingKnown: boolean
  writerAvailable: boolean
  validatorAvailable: boolean
  /** CMS: HAZIR | KAPALI | HATALI */
  statusLabelTr: 'HAZIR' | 'KAPALI' | 'HATALI'
  notesTr: string[]
}

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'on' || v === 'yes'
}

/** Explicit kill switch. Default false — mode ≠ permission. */
export function isCrawlerAiProviderEnabled(): boolean {
  return envTruthy('CRAWLER_AI_PROVIDER_ENABLED')
}

function probeWriterAvailable(): boolean {
  try {
    const provider = createDeepSeekCanaryProvider()
    const system = buildCanarySystemPrompt()
    const userFn = typeof buildCanaryUserPrompt === 'function'
    return Boolean(provider && typeof provider.chat === 'function' && system.length > 20 && userFn)
  } catch {
    return false
  }
}

function probeValidatorAvailable(): boolean {
  try {
    // Minimal probe — invalid JSON should not throw
    const result = validateCanaryDraft('not-json', { allowRepair: false })
    return typeof result.ok === 'boolean' && Array.isArray(result.issues)
  } catch {
    return false
  }
}

/**
 * True only when kill switch + credential + model + both prices + writer + validator.
 * Never prints secrets. Does not call the provider network.
 */
export function getCrawlerAiProviderReadiness(): CrawlerAiProviderReadiness {
  const notesTr: string[] = []
  const killSwitchEnabled = isCrawlerAiProviderEnabled()
  if (!killSwitchEnabled) {
    notesTr.push('CRAWLER_AI_PROVIDER_ENABLED kapalı (varsayılan).')
  }

  const credentialPresent = Boolean(getDeepSeekApiKey())
  if (!credentialPresent) notesTr.push('DeepSeek kimlik bilgisi yok.')

  const model = getDeepSeekModel()
  const modelOk = Boolean(model?.trim())
  if (!modelOk) notesTr.push('Model yapılandırılmamış.')

  const pricing = getDeepSeekPricing(model)
  const inputPricingKnown = pricing.inputPerMillionUsd != null && Number.isFinite(pricing.inputPerMillionUsd)
  const outputPricingKnown = pricing.outputPerMillionUsd != null && Number.isFinite(pricing.outputPerMillionUsd)
  if (!inputPricingKnown || !outputPricingKnown) {
    notesTr.push('Fiyatlandırma tanımsız (COST_UNKNOWN).')
  }

  const writerAvailable = probeWriterAvailable()
  if (!writerAvailable) notesTr.push('Writer / prompt yolu kullanılamıyor.')

  const validatorAvailable = probeValidatorAvailable()
  if (!validatorAvailable) notesTr.push('Validator kullanılamıyor.')

  let reason: ProviderNotReadyReason | null = null
  if (!killSwitchEnabled) reason = 'PROVIDER_DISABLED'
  else if (!credentialPresent) reason = 'MISSING_CREDENTIAL'
  else if (!modelOk) reason = 'MISSING_MODEL'
  else if (!inputPricingKnown || !outputPricingKnown) reason = 'COST_UNKNOWN'
  else if (!writerAvailable) reason = 'WRITER_UNAVAILABLE'
  else if (!validatorAvailable) reason = 'VALIDATOR_UNAVAILABLE'

  const ready = reason === null
  const statusLabelTr: CrawlerAiProviderReadiness['statusLabelTr'] = !killSwitchEnabled
    ? 'KAPALI'
    : ready
      ? 'HAZIR'
      : 'HATALI'

  if (ready) notesTr.push('Provider hazır — harcama hâlâ AI modu + bütçe + job kapılarına bağlı.')

  return {
    ready,
    reason,
    killSwitchEnabled,
    credentialPresent,
    model: modelOk ? model : null,
    inputPricingKnown,
    outputPricingKnown,
    writerAvailable,
    validatorAvailable,
    statusLabelTr,
    notesTr,
  }
}
