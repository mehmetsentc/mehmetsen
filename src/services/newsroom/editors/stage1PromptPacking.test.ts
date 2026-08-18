import { describe, expect, it } from 'vitest'
import { measureStage1PromptParts } from '@/lib/ai/usage/promptSize'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'
import { hashStage1WriterInput } from '@/services/newsroom/editors/stage1_contentWriter'
import {
  STAGE1_WRITER_PACKED_PROMPT_VERSION,
  STAGE1_WRITER_PROMPT_VERSION,
  buildStage1WriterPrompt,
  type WriterInput,
} from '@/services/newsroom/editors/stage1_contentWriter'

const SOURCE_SENTINEL = 'SOURCE_SENTINEL_2J_8F31'
const PREVIOUS_DRAFT_SENTINEL = 'PREVIOUS_DRAFT_SENTINEL_2J_8F31'
const CONTINUATION_HINT = 'Önceki çıktı YARIM KESİLMİŞ-TEST — tüm alanları eksiksiz tamamla'
const QUALITY_HINT = 'Gövde çok kısa — olgu ve bağlam ekle'

const TITLE = 'TBMM Yasa Paketi 4821 kabul edildi'
const BODY = `${SOURCE_SENTINEL} Feribot tarifesi Gökçeada hattında 07.40 seferi yeniden düzenlendi.`
const SUMMARY = 'Gökçeada feribot saatleri değişti.'
const SOURCE_URL = 'https://example.test/tbmm-yasa-paketi-4821'

function personaOverride(): string {
  return `--- KAYNAK VERİSİ (UNTRUSTED DATA) ---
URL: ${SOURCE_URL}
Başlık: ${TITLE}
Metin:
${BODY}
--- KAYNAK VERİSİ SONU ---

Görev: Bu editörün tarzında kısa gazete haberi. JSON: title, spot, summary, content, seoTitle, seoDescription`
}

const withOverride: WriterInput = {
  sourceLabel: 'AA',
  originalTitle: TITLE,
  originalSummary: SUMMARY,
  originalContent: BODY,
  sourceUrl: SOURCE_URL,
  systemPromptOverride: 'CORE_CONSTITUTION\n\nNEWS_FORMAT_LOCK\nHARD_RULES_PLACEHOLDER',
  userPromptOverride: personaOverride(),
  sourceAlreadyIncluded: true,
}

const noOverride: WriterInput = {
  sourceLabel: 'AA',
  originalTitle: TITLE,
  originalSummary: SUMMARY,
  originalContent: BODY,
  sourceUrl: SOURCE_URL,
}

const previousDraft = {
  title: 'Taslak manşet A çok farklı',
  spot: 'Spot A biter.',
  content: `${PREVIOUS_DRAFT_SENTINEL} Önceki taslak gövdesi kaynak sentinel içermez.`,
}

function serialize(input: WriterInput, opts?: { packSource?: boolean }) {
  return buildStage1WriterPrompt(input, opts)
}

function joined(input: WriterInput, opts?: { packSource?: boolean }): string {
  return serialize(input, opts).messages.map((m) => `${m.role}:${m.content}`).join('\n')
}

function countExact(haystack: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1
    i += needle.length
  }
  return n
}

function assertJsonContract(text: string) {
  expect(text).toContain('GAZETE HABERİ yaz')
  expect(text).toContain('"title": "string"')
  expect(text).toContain('"spot": "string"')
  expect(text).toContain('"summary": "string"')
  expect(text).toContain('"content": "string"')
  expect(text).toContain('"seoTitle": "string"')
  expect(text).toContain('"seoDescription": "string"')
  expect(countExact(text, '"seoDescription": "string"')).toBe(1)
}

describe('Stage1 source-once packing — explicit ownership flag', () => {
  it('CASE A — override + sourceAlreadyIncluded: source body once', () => {
    const bundle = serialize(withOverride)
    const text = joined(withOverride)
    expect(bundle.promptPacking).toBe('source_once')
    expect(bundle.promptVersion).toBe(STAGE1_WRITER_PACKED_PROMPT_VERSION)
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(countExact(text, SOURCE_URL)).toBe(1)
    expect(text).not.toContain('Kaynak URL:')
    expect(text).not.toContain('İçerik:\n')
    assertJsonContract(text)
  })

  it('CASE B — no override: source body once (inline owner)', () => {
    const bundle = serialize(noOverride)
    const text = joined(noOverride)
    expect(bundle.promptPacking).toBe('source_inline')
    expect(bundle.promptVersion).toBe(STAGE1_WRITER_PROMPT_VERSION)
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(text).toContain('Kaynak URL:')
    expect(text).toContain('İçerik:')
    assertJsonContract(text)
  })

  it('CASE C — continuation + override: source once, previousDraft once, hints present', () => {
    const input: WriterInput = {
      ...withOverride,
      generationReason: 'continuation',
      revisionHints: [CONTINUATION_HINT, 'content en az 220 kelime olsun'],
      previousDraft,
    }
    const text = joined(input)
    expect(serialize(input).promptPacking).toBe('source_once')
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(countExact(text, PREVIOUS_DRAFT_SENTINEL)).toBe(1)
    expect(text).toContain(CONTINUATION_HINT)
    expect(text).toContain('YENİDEN DÜZENLEME GÖREVİ:')
    assertJsonContract(text)
  })

  it('CASE D — quality_retry + override: source once, previousDraft once, quality hints present', () => {
    const input: WriterInput = {
      ...withOverride,
      generationReason: 'quality_retry',
      revisionHints: [QUALITY_HINT, 'short_body_quality'],
      previousDraft,
    }
    const text = joined(input)
    expect(serialize(input).promptPacking).toBe('source_once')
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(countExact(text, PREVIOUS_DRAFT_SENTINEL)).toBe(1)
    expect(text).toContain(QUALITY_HINT)
    assertJsonContract(text)
  })

  it('CASE E — default continuation: source once, previousDraft once', () => {
    const input: WriterInput = {
      ...noOverride,
      generationReason: 'continuation',
      revisionHints: [CONTINUATION_HINT],
      previousDraft,
    }
    const text = joined(input)
    expect(serialize(input).promptPacking).toBe('source_inline')
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(countExact(text, PREVIOUS_DRAFT_SENTINEL)).toBe(1)
    expect(text).toContain(CONTINUATION_HINT)
    assertJsonContract(text)
  })

  it('CASE F — default quality_retry: source once, previousDraft once', () => {
    const input: WriterInput = {
      ...noOverride,
      generationReason: 'quality_retry',
      revisionHints: [QUALITY_HINT],
      previousDraft,
    }
    const text = joined(input)
    expect(serialize(input).promptPacking).toBe('source_inline')
    expect(countExact(text, SOURCE_SENTINEL)).toBe(1)
    expect(countExact(text, PREVIOUS_DRAFT_SENTINEL)).toBe(1)
    expect(text).toContain(QUALITY_HINT)
    assertJsonContract(text)
  })

  it('does not pack from KAYNAK VERİSİ wording without sourceAlreadyIncluded', () => {
    const input: WriterInput = {
      ...withOverride,
      sourceAlreadyIncluded: undefined,
    }
    const text = joined(input)
    expect(serialize(input).promptPacking).toBe('source_inline')
    expect(countExact(text, SOURCE_SENTINEL)).toBe(2)
  })

  it('legacy concat still duplicates when packSource is false', () => {
    const text = joined(withOverride, { packSource: false })
    expect(countExact(text, SOURCE_SENTINEL)).toBe(2)
  })
})

describe('Stage1 packing telemetry', () => {
  it('persists closed packing enum without article or sentinel text', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'generate_article',
      promptVersion: STAGE1_WRITER_PACKED_PROMPT_VERSION,
      stage1PromptPacking: 'source_once',
      generationReason: 'initial',
    })
    expect(doc.stage1PromptPacking).toBe('source_once')
    expect(doc.promptVersion).toBe('stage1-writer:source_once_v1')
    expect(JSON.stringify(doc)).not.toMatch(/SOURCE_SENTINEL/)
    expect(JSON.stringify(doc)).not.toMatch(/KAYNAK VERİSİ/)
  })

  it('drops unknown packing values', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'generate_article',
      stage1PromptPacking: 'please_pack_this_article_text',
    })
    expect(doc.stage1PromptPacking).toBeUndefined()
  })
})

describe('Phase 2G hash semantics with source-once packing', () => {
  it('identical packed quality_retry messages produce the same SHA-256 hash', () => {
    const qr: WriterInput = {
      ...withOverride,
      generationReason: 'quality_retry',
      revisionHints: [QUALITY_HINT],
      previousDraft,
    }
    const a = hashStage1WriterInput(qr)
    const b = hashStage1WriterInput(qr)
    const changed = hashStage1WriterInput({
      ...qr,
      previousDraft: { ...previousDraft, content: 'farklı taslak gövdesi' },
    })
    expect(a.inputHash).toBeTruthy()
    expect(a.inputHash).toBe(b.inputHash)
    expect(changed.inputHash).not.toBe(a.inputHash)
    expect(a.promptPacking).toBe('source_once')
  })
})

describe('Phase 2J fixture anatomy (not production)', () => {
  it('packed override is smaller than legacy duplicate concat', () => {
    const before = measureStage1PromptParts(serialize(withOverride, { packSource: false }))
    const after = measureStage1PromptParts(serialize(withOverride))
    expect(after.totalTokens).toBeLessThan(before.totalTokens)
    expect(before.totalTokens - after.totalTokens).toBeGreaterThan(20)
  })
})
