/**
 * Global Crawler AI Policy & Master Execution Gates.
 *
 * "KAPIYI KUR, KAPIYI AÇMA"
 * When crawler AI dispatch is disabled, automated crawler/scraper/cron ingestion
 * must NEVER cause paid LLM/provider calls through side paths.
 */
import { isCrawlerAiDispatchEnabled } from './dispatch'
import { isControlledAutoDraftEnabled } from './aiMode'
import { envExplicitTrue } from './legacyFlags'

/**
 * Central gate for AUTOMATED crawler/scraper/background AI operations.
 * Fails closed (false) unless explicitly intended crawler AI dispatch mode is enabled.
 * Covers background AI originating from:
 *   - crawler discovery
 *   - scraper workers (e.g. ankaBreaking, aaContent, etc.)
 *   - RSS workers
 *   - background crons
 *   - automatic enrichment
 *   - automatic category/location classification
 *   - background image metadata & SEO generation
 *   - automatic quality evaluation
 */
export function mayAutomatedCrawlerUseAi(): boolean {
  if (!isCrawlerAiDispatchEnabled()) return false
  return isControlledAutoDraftEnabled()
}

/**
 * Master gate for MANUAL / interactive Content Studio editor AI.
 * Fails closed (false) unless explicitly enabled via MANUAL_EDITOR_AI_ENABLED=true.
 * Defaults to false in production.
 */
export function isManualEditorAiEnabled(): boolean {
  return envExplicitTrue('MANUAL_EDITOR_AI_ENABLED')
}
