/**
 * STAGE 1 — Content Writer
 *
 * Ham RSS → profesyonel Türkçe gazete haberi.
 * Persona (V2) varsa onun constitution/task prompt'u esas alınır;
 * burada yalnızca sabit güvenlik + haber biçimi kuralları eklenir.
 */

import { countPlainWords, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { inputCharLimit, outputTokenLimit } from '@/lib/ai/usage/tokenBudget'
import type { GenerationReason } from '@/lib/ai/usage/generationReason'
import { runStage1Shadow } from '@/lib/ai/stage1Shadow'
import { classifierCohortKey } from '@/lib/ai/groqRouting'
import { measureStage1PromptParts } from '@/lib/ai/usage/promptSize'
import { classifyContinuationTriggers, sanitizeRetryTriggers } from '@/lib/ai/usage/retryTriggers'
import {
  attachStage1RetryOptimizationContext,
  isOptimizedStage1RetryCohort,
  remainingStage1LogicalCalls,
  shouldRunStage1Continuation,
  tryConsumeStage1LogicalCall,
} from '@/lib/ai/stage1RetryOptimization'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import { hashAiInput } from '@/lib/ai/usage/hash'
import { NAHABER_HEADLINE_STYLE } from '@/lib/ai/editorial/headlineStyle'
import { cutAtSentence, cutAtWord } from './fallbackText'

export interface WrittenArticle {
  title: string
  spot: string
  summary: string
  content: string
  seoTitle: string
  seoDescription: string
  aiWritten: boolean
}

export interface WriterInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  systemPromptOverride?: string
  userPromptOverride?: string
  /**
   * Explicit source ownership from the persona builder (pipeline).
   * When true, userPromptOverride already carries the RSS payload — do not
   * append a second title/URL/summary/body block. Never inferred from wording.
   */
  sourceAlreadyIncluded?: boolean
  model?: string
  /** Gate / QC notları — yeniden yazımda düzeltilecek noktalar */
  revisionHints?: string[]
  previousDraft?: { title: string; spot: string; content: string }
  generationReason?: GenerationReason
  /** Closed enum list — continuation / quality_retry audit only. */
  retryTriggers?: string[]
  /** Persona temperature. Defaults to 0.4 when omitted. */
  temperature?: number
}

/** Ortak güvenlik — persona ile birleşir, makale şişirme YOK */
const HARD_RULES = `MUTLAK KURALLAR:
- Kaynakta OLMAYAN bilgi, rakam, alıntı, yasa adı uydurma
- Ajans/gazete adını imza gibi kullanma; ama bilginin SAHİBİNİ metinde belirt (kurum, yetkili, açıklama, belge: "… Valiliği açıkladı", "… yaptığı açıklamada")
- Kaynağın cümlelerini aynen kopyalama; kendi cümlelerinle yaz. Doğrudan alıntıyı yalnızca kaynakta tırnak içindeyse kullan
- DOLDURMA YASAK: kaynakta yeterli olgu yoksa KISA yaz. Genel ansiklopedik bilgi, tekrar, "vatandaşlar dikkatli olmalı" türü nutukla uzatma
- Tarih ve yer açık olsun: "dün/bugün" yerine gün ve ay; yerel haberde il ve ilçe adı ilk paragrafta
- Başlıkta FLAŞ / SON DAKİKA / büyük harf spam yok
- Manşet SES KARTINA uyar. En çarpıcı doğrulanmış olgu başlıkta: sayı, isim, karar. "Büyük kaza" gibi jenerik başlık yasak.
- ŞOK, SKANDAL, DEHŞET, hakaret ve kaynakta olmayan sır yok
- Yarım cümle, kesilmiş kelime bırakma
- Caption metnini ## başlık yapma
- Çıktı her zaman Türkçe
- Yalnızca geçerli JSON döndür`

/**
 * Varsayılan haber biçimi (persona yoksa).
 * Ters piramit: özet → olgular → kısa bağlam. Ansiklopedi / okul kompozisyonu YASAK.
 */
const DEFAULT_NEWS_SYSTEM = `Sen NaHaber içerik editörüsün. Kısa, olgu temelli GAZETE HABERİ yaz.

${NAHABER_HEADLINE_STYLE}

HABER BİÇİMİ (zorunlu):
- Ters piramit: en önemli bilgi başta (kim, ne, nerede, ne zaman) — manşette çarpıcı olgu, spotta ayrıntı
- spot: 2-4 cümle lider; content spot'u tekrarlama
- content: kaynakta yeterli olgu varsa 400-650 kelime; kaynak kısaysa asgari ~220 kelime ve o kadar. Uzunluk için uydurma/doldurma YASAK
- Gövdede EN AZ 2, mümkünse 3-4 tane ## alt başlık ZORUNLU (yalnızca asgari ~220 kelimeye yakın en kısa haberlerde en az 1 yeterli)
- Alt başlıklar olay-özgü ve somut olsun (ör. "Ceza Tutarı", "Resmi Açıklama", "Vatandaşlar Ne Diyor"); jenerik ders kitabı / ansiklopedi başlığı YASAK: "Sonuç", "Giriş", "Gelişme", "Önemi", "Biyolojik Çeşitliliğin Korunması", "Genel Değerlendirme" ve benzeri
- Her ## başlıktan sonra en az 1 dolu paragraf gelsin; başlığı yazıp boş bırakma
- YASAK: uzun genel bilgi paragrafları, ahlak dersi, "bu nedenle vatandaşların…" nutukları
- Kaynak inceyse kısa yaz; arka plan yalnızca doğrulanabilir ve olayla doğrudan ilgiliyse (önceki karar, resmi veri, aynı konudaki önceki gelişme)
- Okurun arama niyetine cevap ver: ne oldu, nerede, ne zaman, kimi etkiliyor, sırada ne var — yalnızca kaynakta olanla

ALANLAR:
- title: gazete manşeti, 6-12 kelime, ideal 50-75 karakter (en fazla 85); ana kişi/kurum/yer adı başa yakın; çarpıcı olgu başlıkta; jenerik veya tıklama tuzağı başlık yasak
- spot: lider paragraf
- summary: feed teaser max 120 karakter, title'dan farklı
- content: gövde (markdown ## ZORUNLU — en az 2 alt başlık; # H1 kullanma)
- seoTitle: 50-60 karakter; insanların arayacağı ana ifade + (yerel haberde) il/ilçe adı; marka adı ekleme
- seoDescription: 140-155 karakter; olayın özü + okura etkisi; soru veya ünlemle bitirme`

export const STAGE1_PROMPT_PACKINGS = ['source_inline', 'source_once'] as const
export type Stage1PromptPacking = (typeof STAGE1_PROMPT_PACKINGS)[number]

export const STAGE1_WRITER_PROMPT_VERSION = 'stage1-writer:v3-seo11'
export const STAGE1_WRITER_PACKED_PROMPT_VERSION = 'stage1-writer:source_once_v2-seo11'

export function normalizeStage1PromptPacking(raw: unknown): Stage1PromptPacking | undefined {
  if (typeof raw === 'string' && (STAGE1_PROMPT_PACKINGS as readonly string[]).includes(raw)) {
    return raw as Stage1PromptPacking
  }
  return undefined
}

function clampWriterTemperature(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.4
  return Math.min(0.7, Math.max(0.15, value))
}

const JSON_OUTPUT_CONTRACT = `GAZETE HABERİ yaz (ters piramit). Ansiklopedi / "Sonuç" bölümü yazma.
title 6-12 kelime; en çarpıcı olgu başlıkta, jenerik manşet yasak. seoTitle de olayı söylesin, ŞOK yok.
content gövdesi ZORUNLU en az 220 kelime; kaynakta yeterli olgu varsa 400-650 kelime. Uzatmak için uydurma/doldurma YASAK; spot'u tekrarlama; olgu + bilginin sahibi + doğrudan ilgili bağlam.
Yerel haberde il/ilçe adı title veya spot'ta geçsin. seoTitle 50-60 karakter: aranacak ana ifade + yer.
content içinde EN AZ 2 olay-özgü ## markdown alt başlık ZORUNLU (jenerik "Sonuç/Giriş/Genel Değerlendirme" başlığı YASAK); başlıksız düz paragraf yığını KABUL EDİLMEZ.
JSON:
{
  "title": "string",
  "spot": "string",
  "summary": "string",
  "content": "string",
  "seoTitle": "string",
  "seoDescription": "string"
}`

function buildRevisionBlock(input: WriterInput): string {
  if (!input.revisionHints?.length && !input.previousDraft) return ''
  const hints = (input.revisionHints ?? []).map((h) => `- ${h}`).join('\n')
  const prev = input.previousDraft
  return `
YENİDEN DÜZENLEME GÖREVİ:
Önceki taslak kalite kapısından geçmedi. Aynı olay için DAHA İYİ bir gazete haberi yaz.
${hints ? `Düzeltilecek noktalar:\n${hints}` : ''}
${prev ? `Önceki başlık: ${prev.title}\nÖnceki spot: ${prev.spot.slice(0, 400)}\nÖnceki gövde (özet):\n${prev.content.slice(0, 2500)}` : ''}
- Gövdeyi en az 220 kelime yap; kaynakta yeterli olgu varsa 400-650; doldurma yok; yarım cümle bırakma
- Kaynakta olmayan bilgi uydurma
- Önceki taslağın hatalarını tekrarlama
`
}

function buildSourceBlock(input: WriterInput): string {
  const content = input.originalContent || input.originalSummary || ''
  const sourceNote = input.sourceUrl
    ? `Kaynak URL: ${input.sourceUrl}`
    : `Kaynak: ${input.sourceLabel}`
  return `${sourceNote}
Başlık: ${input.originalTitle}
Özet: ${input.originalSummary || ''}
İçerik:
${content.slice(0, inputCharLimit('AI_STAGE1_MAX_INPUT_CHARS', 6000))}`
}

function buildPrompt(input: WriterInput, includeSourceBlock: boolean): string {
  const revisionBlock = buildRevisionBlock(input)
  if (!includeSourceBlock) {
    return `${revisionBlock}\n${JSON_OUTPUT_CONTRACT}`.replace(/^\n+/, '')
  }
  return `${buildSourceBlock(input)}
${revisionBlock}
${JSON_OUTPUT_CONTRACT}`
}

export type Stage1WriterPromptBundle = {
  systemContent: string
  userContent: string
  sourceArticle: string
  promptPacking: Stage1PromptPacking
  promptVersion: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
}

/** Same messages callDeepSeek sends. Hash only — never persist the strings. */
export function buildStage1WriterPrompt(
  input: WriterInput,
  opts?: { packSource?: boolean }
): Stage1WriterPromptBundle {
  const packSource = opts?.packSource !== false
  const override = input.userPromptOverride?.trim()
  const pack =
    packSource && Boolean(override) && input.sourceAlreadyIncluded === true
  const promptPacking: Stage1PromptPacking = pack ? 'source_once' : 'source_inline'
  const promptVersion = pack ? STAGE1_WRITER_PACKED_PROMPT_VERSION : STAGE1_WRITER_PROMPT_VERSION
  const systemContent = input.systemPromptOverride?.trim()
    ? `${input.systemPromptOverride.trim()}\n\n${HARD_RULES}`
    : `${DEFAULT_NEWS_SYSTEM}\n\n${HARD_RULES}`
  const writerTail = buildPrompt(input, !pack)
  const userContent = override ? `${override}\n\n${writerTail}` : writerTail
  const sourceArticle = (input.originalContent || input.originalSummary || '').slice(
    0,
    inputCharLimit('AI_STAGE1_MAX_INPUT_CHARS', 6000)
  )
  return {
    systemContent,
    userContent,
    sourceArticle,
    promptPacking,
    promptVersion,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  }
}

export function hashStage1WriterInput(input: WriterInput): {
  inputHash?: string
  promptSystemTokens: number
  promptSourceTokens: number
  promptInstructionTokens: number
  promptOtherTokens: number
  promptTotalTokens: number
  promptPacking: Stage1PromptPacking
} {
  const bundle = buildStage1WriterPrompt(input)
  const promptParts = measureStage1PromptParts({
    systemContent: bundle.systemContent,
    userContent: bundle.userContent,
    sourceArticle: bundle.sourceArticle,
  })
  return {
    inputHash: hashAiInput(bundle.messages.map((m) => `${m.role}:${m.content}`).join('\n')),
    promptSystemTokens: promptParts.systemTokens,
    promptSourceTokens: promptParts.sourceTokens,
    promptInstructionTokens: promptParts.instructionTokens,
    promptOtherTokens: promptParts.otherTokens,
    promptTotalTokens: promptParts.totalTokens,
    promptPacking: bundle.promptPacking,
  }
}

async function callDeepSeek(input: WriterInput): Promise<WrittenArticle | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const { deepseekChatCompletion, getDeepSeekModel } = await import('@/lib/ai/deepseekClient')
  const model = getDeepSeekModel(input.model)

  const {
    systemContent,
    userContent,
    sourceArticle,
    messages,
    promptVersion,
    promptPacking,
  } = buildStage1WriterPrompt(input)

  // 50s timeout: stage1 × 2 (incomplete retry) + stage3 = ~130s per article, well under 200s budget
  const timeoutMs = Number(process.env.DEEPSEEK_WRITER_TIMEOUT_MS ?? 50_000)
  const temperature = clampWriterTemperature(input.temperature)
  const maxTokens = outputTokenLimit('AI_STAGE1_MAX_OUTPUT_TOKENS', 3500)
  const generationReason: GenerationReason = input.generationReason ?? 'initial'
  attachStage1RetryOptimizationContext()
  const ctx = getAiUsageContext()
  if (!tryConsumeStage1LogicalCall(ctx?.stage1CallBudget)) {
    console.warn('[stage1] logical call cap reached — skipping DeepSeek')
    return null
  }
  const promptParts = measureStage1PromptParts({
    systemContent,
    userContent,
    sourceArticle,
  })
  const promptTelemetry = {
    promptSystemTokens: promptParts.systemTokens,
    promptSourceTokens: promptParts.sourceTokens,
    promptInstructionTokens: promptParts.instructionTokens,
    promptOtherTokens: promptParts.otherTokens,
    promptVersion,
    stage1PromptPacking: promptPacking,
  }

  try {
    let raw: string
    try {
      raw = await deepseekChatCompletion({
        model,
        messages,
        temperature,
        maxTokens,
        timeoutMs,
        disableThinking: true,
        jsonMode: true,
        telemetry: {
          agentName: 'stage1_writer',
          operation: 'generate_article',
          attempt: 1,
          generationReason,
          ...promptTelemetry,
          retryTriggers: sanitizeRetryTriggers(input.retryTriggers),
          promptVariant: ctx?.retryOptCohort === 'off' ? undefined : ctx?.retryOptCohort,
          canaryBucket: ctx?.retryOptBucket,
        },
      })
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!/HTTP 429|boş yanıt|0 karakter/i.test(msg)) {
        console.error('[stage1/deepseek]', msg)
        return null
      }
      console.warn('[stage1/deepseek] retry after', msg.slice(0, 80))
      await new Promise((r) => setTimeout(r, 3000))
      raw = await deepseekChatCompletion({
        model,
        messages,
        temperature,
        maxTokens,
        timeoutMs,
        disableThinking: true,
        jsonMode: true,
        telemetry: {
          agentName: 'stage1_writer',
          operation: 'generate_article',
          attempt: 2,
          retryCount: 1,
          generationReason: 'provider_retry',
          ...promptTelemetry,
          retryTriggers: sanitizeRetryTriggers(input.retryTriggers),
          promptVariant: ctx?.retryOptCohort === 'off' ? undefined : ctx?.retryOptCohort,
          canaryBucket: ctx?.retryOptBucket,
        },
      })
    }

    let parsed: Partial<WrittenArticle>
    try {
      let jsonStr = raw
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) jsonStr = fence[1]!.trim()
      if (!jsonStr.startsWith('{')) {
        const obj = jsonStr.match(/\{[\s\S]*\}/)
        if (obj) jsonStr = obj[0]
      }
      parsed = JSON.parse(jsonStr) as Partial<WrittenArticle>
    } catch {
      console.error('[stage1/deepseek] JSON parse failed')
      return null
    }

    const title = String(parsed.title ?? '').trim()
    const body = String(parsed.content ?? '').trim()
    if (!title || !body) return null

    return {
      title,
      spot: String(parsed.spot ?? '').trim(),
      summary: String(parsed.summary ?? '').trim(),
      content: body,
      seoTitle: String(parsed.seoTitle ?? title).trim(),
      seoDescription: String(parsed.seoDescription ?? '').trim(),
      aiWritten: true,
    }
  } catch (err) {
    console.error('[stage1/deepseek]', err instanceof Error ? err.message : err)
    return null
  }
}

export async function writeArticle(input: WriterInput): Promise<WrittenArticle> {
  console.log(`[stage1/contentWriter] başlıyor: "${input.originalTitle.slice(0, 60)}"`)
  attachStage1RetryOptimizationContext()
  const generationReason: GenerationReason = input.generationReason ?? 'initial'
  const optimized = isOptimizedStage1RetryCohort()
  let written = await callDeepSeek(input)

  // Yarım / kısa çıktı → bir kez daha yaz. Canary: <220 kelime tek başına continuation değil.
  if (
    written &&
    shouldRunStage1Continuation(written, optimized) &&
    remainingStage1LogicalCalls(getAiUsageContext()?.stage1CallBudget) > 0
  ) {
    console.warn('[stage1] yarım/kısa çıktı — tamamlamak için yeniden yazılıyor')
    const repaired = await callDeepSeek({
      ...input,
      generationReason: 'continuation',
      retryTriggers: classifyContinuationTriggers(written),
      revisionHints: [
        ...(input.revisionHints ?? []),
        'Önceki çıktı YARIM KESİLMİŞ — tüm alanları (title, spot, summary, content) eksiksiz tamamla',
        'Hiçbir cümleyi ortada bırakma; spot ve content nokta ile bitsin',
        `content en az ${MIN_NEWS_BODY_WORDS} kelime olsun`,
      ],
      previousDraft: {
        title: written.title,
        spot: written.spot,
        content: written.content,
      },
    })
    if (repaired && !shouldRunStage1Continuation(repaired, optimized)) {
      written = repaired
    } else if (repaired && countPlainWords(repaired.content) > countPlainWords(written.content)) {
      written = repaired
    }
  }

  if (written) {
    console.log(`[stage1] DeepSeek başarılı: "${written.title.slice(0, 60)}"`)
    if (generationReason === 'initial') {
      const bundle = buildStage1WriterPrompt(input)
      const promptParts = measureStage1PromptParts({
        systemContent: bundle.systemContent,
        userContent: bundle.userContent,
        sourceArticle: bundle.sourceArticle,
      })
      void runStage1Shadow({
        messages: bundle.messages,
        cohortKey: classifierCohortKey(),
        generationReason,
        productionInputTokens: promptParts.totalTokens,
        promptSystemTokens: promptParts.systemTokens,
        promptSourceTokens: promptParts.sourceTokens,
        promptInstructionTokens: promptParts.instructionTokens,
        promptOtherTokens: promptParts.otherTokens,
      }).catch(() => undefined)
    }
    return written
  }

  console.warn(`[stage1] DeepSeek başarısız — ham fallback: "${input.originalTitle.slice(0, 60)}"`)
  // Raw fallback: never cut a word in half (see fallbackText.ts).
  const fallback = (input.originalContent || input.originalSummary || input.originalTitle).trim()
  const spotSrc = (input.originalSummary || '').trim()
  return {
    // Full source title: 70 chars is only an editor hint in the CMS.
    title: input.originalTitle.replace(/\s+/g, ' ').trim(),
    spot: cutAtSentence(spotSrc, 400),
    summary: cutAtSentence(input.originalSummary || input.originalTitle, 120),
    content: cutAtSentence(fallback, 800),
    seoTitle: cutAtWord(input.originalTitle, 65),
    seoDescription: cutAtSentence(input.originalSummary || input.originalTitle, 160),
    aiWritten: false,
  }
}
