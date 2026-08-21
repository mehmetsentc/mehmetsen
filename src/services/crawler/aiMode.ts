/**
 * Phase 4D staged AI modes.
 * Default OFF — Stage 1 / Phase 4E never activates CONTROLLED_AUTO_DRAFT in production without acceptance.
 * Phase 4E operating modes for rollout: OFF | MANUAL_CANARY | CONTROLLED_AUTO_DRAFT.
 * Phase 4F.3: SHADOW_AUTO_DRAFT — classify + pre-spend + economics; never paid jobs.
 * FULL_AUTO_DRAFT remains parseable for future phases but is not enabled in 4E/4F.3 acceptance.
 * No AUTO_PUBLISH mode exists.
 */

import { isCrawlerAiDispatchEnabled } from './dispatch'
import { isLegacyDirectAiEnabled } from './legacyFlags'

export const CRAWLER_AI_MODES = [
  'OFF',
  'MANUAL_CANARY',
  'SHADOW_AUTO_DRAFT',
  'CONTROLLED_AUTO_DRAFT',
  'FULL_AUTO_DRAFT',
] as const

export type CrawlerAiMode = (typeof CRAWLER_AI_MODES)[number]

export function parseCrawlerAiMode(raw: string | undefined | null): CrawlerAiMode {
  const v = (raw || 'OFF').trim().toUpperCase()
  if (v === 'MANUAL_CANARY') return 'MANUAL_CANARY'
  if (v === 'SHADOW_AUTO_DRAFT') return 'SHADOW_AUTO_DRAFT'
  if (v === 'CONTROLLED_AUTO_DRAFT') return 'CONTROLLED_AUTO_DRAFT'
  if (v === 'FULL_AUTO_DRAFT') return 'FULL_AUTO_DRAFT'
  return 'OFF'
}

/** Env: CRAWLER_AI_MODE. Default OFF. */
export function getCrawlerAiMode(): CrawlerAiMode {
  return parseCrawlerAiMode(process.env.CRAWLER_AI_MODE)
}

/** Shadow economics path — never creates PENDING jobs / never spends. */
export function isShadowAutoDraftEnabled(): boolean {
  return getCrawlerAiMode() === 'SHADOW_AUTO_DRAFT'
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
  shadowAutoDraft: boolean
  autoPublish: false
  notesTr: string[]
} {
  const mode = getCrawlerAiMode()
  const dispatchEnabled = isCrawlerAiDispatchEnabled()
  const legacyDirectAiEnabled = isLegacyDirectAiEnabled()
  const autoDraftEnabled = isControlledAutoDraftEnabled()
  const shadowAutoDraft = isShadowAutoDraftEnabled()
  const notesTr: string[] = []
  if (mode === 'OFF') notesTr.push('CRAWLER_AI_MODE=OFF — otomatik taslak kapalı.')
  if (mode === 'MANUAL_CANARY') notesTr.push('Yalnızca manuel canary; otomatik taslak yok.')
  if (mode === 'SHADOW_AUTO_DRAFT') {
    notesTr.push('Gölge ekonomi açık — harcama yok; WOULD_DISPATCH/WOULD_BLOCK gözlemi.')
  }
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
    shadowAutoDraft,
    autoPublish: false,
    notesTr,
  }
}
