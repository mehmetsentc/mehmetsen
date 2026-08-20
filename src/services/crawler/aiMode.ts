/**
 * Phase 4D staged AI modes.
 * Default OFF — Stage 1 never activates CONTROLLED_AUTO_DRAFT in production.
 * No AUTO_PUBLISH mode exists in Phase 4D.
 */

import { isCrawlerAiDispatchEnabled } from './dispatch'
import { isLegacyDirectAiEnabled } from './legacyFlags'

export const CRAWLER_AI_MODES = [
  'OFF',
  'MANUAL_CANARY',
  'CONTROLLED_AUTO_DRAFT',
  'FULL_AUTO_DRAFT',
] as const

export type CrawlerAiMode = (typeof CRAWLER_AI_MODES)[number]

export function parseCrawlerAiMode(raw: string | undefined | null): CrawlerAiMode {
  const v = (raw || 'OFF').trim().toUpperCase()
  if (v === 'MANUAL_CANARY') return 'MANUAL_CANARY'
  if (v === 'CONTROLLED_AUTO_DRAFT') return 'CONTROLLED_AUTO_DRAFT'
  if (v === 'FULL_AUTO_DRAFT') return 'FULL_AUTO_DRAFT'
  return 'OFF'
}

/** Env: CRAWLER_AI_MODE. Default OFF. */
export function getCrawlerAiMode(): CrawlerAiMode {
  return parseCrawlerAiMode(process.env.CRAWLER_AI_MODE)
}

/** Auto-draft job creation allowed only in controlled/full modes AND master dispatch on. */
export function isControlledAutoDraftEnabled(): boolean {
  const mode = getCrawlerAiMode()
  if (mode !== 'CONTROLLED_AUTO_DRAFT' && mode !== 'FULL_AUTO_DRAFT') return false
  return isCrawlerAiDispatchEnabled()
}

/** Paid provider calls for automatic lane — still requires provider wiring + budgets. */
export function isAutoDraftSpendAllowed(): boolean {
  return isControlledAutoDraftEnabled() && !isLegacyDirectAiEnabled()
}

export function crawlerAiModeStatus(): {
  mode: CrawlerAiMode
  dispatchEnabled: boolean
  legacyDirectAiEnabled: boolean
  autoDraftEnabled: boolean
  autoPublish: false
  notesTr: string[]
} {
  const mode = getCrawlerAiMode()
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const legacyDirectAiEnabled = isLegacyDirectAiEnabled()
  const autoDraftEnabled = isControlledAutoDraftEnabled()
  const notesTr: string[] = []
  if (mode === 'OFF') notesTr.push('CRAWLER_AI_MODE=OFF — otomatik taslak kapalı.')
  if (mode === 'MANUAL_CANARY') notesTr.push('Yalnızca manuel canary; otomatik taslak yok.')
  if ((mode === 'CONTROLLED_AUTO_DRAFT' || mode === 'FULL_AUTO_DRAFT') && !dispatchEnabled) {
    notesTr.push('Mod hazır ama CRAWLER_AI_DISPATCH_ENABLED=false — harcama yok.')
  }
  if (legacyDirectAiEnabled) notesTr.push('LEGACY_DIRECT_AI_ENABLED açık — beklenmeyen durum.')
  notesTr.push('AUTO_PUBLISH yok; AI_DRAFT sonrası editör onayı zorunlu.')
  return {
    mode,
    dispatchEnabled,
    legacyDirectAiEnabled,
    autoDraftEnabled,
    autoPublish: false,
    notesTr,
  }
}
