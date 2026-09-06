/**
 * Faz A3 Task 17 — Editorial Memory mode.
 * Mirrors the existing, already-production `CrawlerAiMode` pattern
 * (services/crawler/aiMode.ts) instead of inventing a new mechanism or a
 * new AiEditorDocument schema field.
 *
 * Default OFF. A3 does not activate SHADOW in production and does not wire
 * an ON path anywhere — 'ON' is parseable for a future phase only, exactly
 * like `aiMode.ts`'s FULL_AUTO_DRAFT stays parseable-but-unused.
 *
 * IMPORTANT: this mode gates BACKGROUND/RUNTIME retrieval only. The manual
 * admin "Geçmişi Ara" diagnostic action (Task 12-13) does NOT read this
 * value and does NOT require SHADOW — it is an explicit, human-invoked,
 * per-request diagnostic call, independent of any global mode (A3 Task 1
 * correction #3).
 */

export const EDITORIAL_MEMORY_MODES = ['OFF', 'SHADOW', 'ON'] as const
export type EditorialMemoryMode = (typeof EDITORIAL_MEMORY_MODES)[number]

export function parseEditorialMemoryMode(raw: string | undefined | null): EditorialMemoryMode {
  const v = (raw || 'OFF').trim().toUpperCase()
  if (v === 'SHADOW') return 'SHADOW'
  if (v === 'ON') return 'ON'
  return 'OFF'
}

/** Env: EDITORIAL_MEMORY_MODE. Default OFF. Governs background retrieval only. */
export function getEditorialMemoryMode(): EditorialMemoryMode {
  return parseEditorialMemoryMode(process.env.EDITORIAL_MEMORY_MODE)
}

/** Background retrieval may run (never injected into a prompt by this alone). */
export function isEditorialMemoryShadowEnabled(): boolean {
  return getEditorialMemoryMode() === 'SHADOW' || getEditorialMemoryMode() === 'ON'
}

/**
 * Prompt-injection gate. A3 NEVER returns true from any code path that is
 * actually wired to promptBuilder — there is no such wiring in this phase.
 * This function exists only so a future phase has one, already-named place
 * to implement that gate; it is intentionally unused in A3.
 */
export function isEditorialMemoryInjectionEnabled(): boolean {
  return false
}

export function editorialMemoryModeStatus(): {
  mode: EditorialMemoryMode
  shadowEnabled: boolean
  injectionEnabled: false
  notesTr: string[]
} {
  const mode = getEditorialMemoryMode()
  const notesTr: string[] = []
  if (mode === 'OFF') notesTr.push('EDITORIAL_MEMORY_MODE=OFF — arka plan hafıza sorgusu yok.')
  if (mode === 'SHADOW') notesTr.push('Gölge modu — sonuçlar sadece admin arayüzünde görülür, prompt’a asla eklenmez.')
  if (mode === 'ON') notesTr.push('ON ayrıştırılabiliyor ama HİÇBİR koda bağlı değil — bu fazda prompt enjeksiyonu yok.')
  notesTr.push('Manuel admin "Geçmişi Ara" eylemi bu moddan bağımsızdır — her zaman elle tetiklenir.')
  return { mode, shadowEnabled: isEditorialMemoryShadowEnabled(), injectionEnabled: false, notesTr }
}
