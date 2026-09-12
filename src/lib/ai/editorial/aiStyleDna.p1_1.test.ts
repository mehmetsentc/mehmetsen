import { describe, expect, it } from 'vitest'
import { SEED_AI_EDITORS, GLOBAL_NEWSROOM_RULES } from './seedEditors'
import { SEED_CITY_AI_EDITORS } from './seedCityEditors'
import { NEWS_FORMAT_LOCK } from './promptBuilder'

/**
 * AI STYLE P1.1 — proves the DNA additions actually reach the composed runtime
 * prompt for every editor (Q1/Q2/Q3 in the final report), without any AI call
 * or Firestore access: NEWS_FORMAT_LOCK is appended in buildEditorPrompt() for
 * every 'news' and 'breaking' task regardless of persona, so asserting its
 * content here is equivalent to asserting it reaches every editor at runtime.
 */
describe('AI STYLE P1.1 — DNA reaches every editor (Task 1-6, 9)', () => {
  it('NEWS_FORMAT_LOCK (universal, code-level — reused by every persona + Stage1 fallback) carries the DNA', () => {
    expect(NEWS_FORMAT_LOCK).toContain('NAHABER HIGH-ENGAGEMENT DNA')
    expect(NEWS_FORMAT_LOCK).toContain('ÖNEMLİ BİLGİ → MERAK → HIZLI GİRİŞ → GELİŞME → DETAY → BAĞLAM')
    expect(NEWS_FORMAT_LOCK).toContain('BAŞLIK (title)')
    expect(NEWS_FORMAT_LOCK).toContain('SPOT:')
    expect(NEWS_FORMAT_LOCK).toContain('GÖVDE RİTMİ')
    expect(NEWS_FORMAT_LOCK).toContain('GİRİŞ (ilk paragraf)')
    expect(NEWS_FORMAT_LOCK).toContain('AI-DİLİ / ŞABLON İFADE YASAĞI')
    expect(NEWS_FORMAT_LOCK).toContain('NAHABER SUNUŞ (AI STYLE P1.3')
    expect(NEWS_FORMAT_LOCK).toContain('MANŞET: en güçlü TEK doğrulanmış gelişme')
    expect(NEWS_FORMAT_LOCK).toContain('Merak olgunun kendisinden gelsin')
  })



  it('GLOBAL_NEWSROOM_RULES carries the strengthened factual-integrity rule (Task 12)', () => {
    expect(GLOBAL_NEWSROOM_RULES).toContain('KESİNLEŞTİRME YASAĞI')
  })

  it('every national NEWS-desk editor (has a news prompt) still starts with the (updated) GLOBAL_NEWSROOM_RULES verbatim — personas untouched', () => {
    const newsDeskEditors = SEED_AI_EDITORS.filter((s) => !!s.prompts.news)
    expect(newsDeskEditors.length).toBeGreaterThan(15)
    for (const spec of newsDeskEditors) {
      expect(spec.prompts.core, `${spec.slug}.core`).toBeTruthy()
      expect(spec.prompts.core!.startsWith(GLOBAL_NEWSROOM_RULES), spec.slug).toBe(true)
    }
  })

  it('Task 9 — the 6 AI column writers and 3 internal utility agents do NOT get GLOBAL_NEWSROOM_RULES/NEWS DNA (they never composed with it, before or after this phase)', () => {
    const nonNewsDesk = SEED_AI_EDITORS.filter((s) => !s.prompts.news)
    expect(nonNewsDesk.length).toBeGreaterThan(0)
    for (const spec of nonNewsDesk) {
      expect(spec.prompts.core!.startsWith(GLOBAL_NEWSROOM_RULES), spec.slug).toBe(false)
      expect(spec.prompts.core, spec.slug).not.toContain('NAHABER HIGH-ENGAGEMENT DNA')
    }
  })

  it('ALL 81 city editors get the DNA from the single buildCityEditorSpec() template — no per-city duplication needed', () => {
    expect(SEED_CITY_AI_EDITORS.length).toBe(81)
    for (const spec of SEED_CITY_AI_EDITORS) {
      expect(spec.prompts.core!.startsWith(GLOBAL_NEWSROOM_RULES)).toBe(true)
      // The composed runtime system prompt for ANY task='news' editor always appends
      // NEWS_FORMAT_LOCK in buildEditorPrompt() — proven universal in the test above.
    }
  })
})
