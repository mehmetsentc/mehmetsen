import 'server-only'

/**
 * STORY-1 — AI steps of «Konu → Video» (Gemini, the key NaHaber already uses):
 *   describeImage / describeVideo — one Turkish sentence of what an upload shows,
 *                                    used to match it to a sentence (fast model, vision)
 *   planStory                     — scenes, highlights, labels, visual choice (fast model, JSON)
 *   generateIllustration          — a 9:16 / 16:9 illustration for a scene with no fitting upload
 *                                    (image model, paid: monthly USD budget in Firestore)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { getGeminiApiKey, getGeminiFastModel } from '@/lib/ai/router/policy'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  illustrationPrompt,
  longScenes,
  longSections,
  parseLongScript,
  parsePlan,
  parseVisuals,
  planSystemPrompt,
  planUserPrompt,
  scriptSystemPrompt,
  SECTION_CHARS,
  visualsSystemPrompt,
  visualsUserPrompt,
  type PlanResult,
  type StoryFormat,
  type StoryProject,
  type StoryStyle,
} from './storyProject'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const USAGE = 'storyUsage'

export function storyAiReady(): { text: boolean; images: boolean } {
  const key = Boolean(getGeminiApiKey())
  const off = (process.env.STORY_AI ?? 'on').toLowerCase() === 'off'
  return { text: key && !off, images: key && !off && (process.env.STORY_IMAGES ?? 'on').toLowerCase() !== 'off' }
}

// ── vision ───────────────────────────────────────────────────────────────────

const DESCRIBE_PROMPT =
  'Bu görüntüyü kısa bir haber videosunda hangi cümleye koyacağımızı seçmek için tarif et. ' +
  'Türkçe, tek cümle, en fazla 30 kelime: ne görünüyor (yer, nesne, olay, insanlar — kimlik tahmini yapma), çekim türü (geniş / yakın, gece / gündüz). ' +
  'Görüntüde okunabilir bir yazı veya tabela varsa onu da yaz.'

async function visionCall(jpeg: Buffer, extra = ''): Promise<string> {
  const key = getGeminiApiKey()
  if (!key) throw new Error('Gemini anahtarı yok')
  const model = getGeminiFastModel() || 'gemini-2.5-flash'
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: DESCRIBE_PROMPT + extra }, { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const j = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } } | null
  if (!res.ok || !j) throw new Error(`Gemini görüntü okuma hatası (${res.status}${j?.error?.message ? `: ${j.error.message.slice(0, 120)}` : ''})`)
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('Gemini görüntüyü tarif etmedi')
  return text.slice(0, 400)
}

export async function describeImage(bytes: Buffer): Promise<string> {
  const { previewJpeg } = await import('./storyOverlay')
  return visionCall(await previewJpeg(bytes))
}

/** Four frames of the video in a 2×2 grid, described as one shot sequence. */
export async function describeVideo(frames: Buffer[]): Promise<string> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const imgs = await Promise.all(frames.map((f) => loadImage(f)))
  const cw = 384
  const ch = Math.round((cw * (imgs[0]?.height ?? 9)) / (imgs[0]?.width ?? 16))
  const canvas = createCanvas(cw * 2, ch * 2)
  const ctx = canvas.getContext('2d')
  imgs.slice(0, 4).forEach((im, i) => ctx.drawImage(im, (i % 2) * cw, Math.floor(i / 2) * ch, cw, ch))
  return visionCall(await canvas.encode('jpeg', 80), ' Bu dört kare aynı videodan sırayla alındı; videonun bütününü tarif et.')
}

// ── plan ─────────────────────────────────────────────────────────────────────

export async function planStory(p: StoryProject, newId: () => string): Promise<PlanResult & { note: string | null }> {
  if ((p.targetMin ?? 1) > 1) return planLongStory(p, newId)
  let raw: string | null = null
  let note: string | null = null
  if (storyAiReady().text) {
    try {
      const r = await geminiFastChat({
        messages: [
          { role: 'system', content: planSystemPrompt({ targetMin: 1, format: p.format }) },
          { role: 'user', content: planUserPrompt(p) },
        ],
        temperature: 0.5,
        maxTokens: 4000,
        timeoutMs: 45_000,
        jsonMode: true,
        telemetry: { agentName: 'story_planner', operation: 'story_plan' },
      })
      raw = r.text
    } catch (err) {
      note = `AI editör cevap vermedi: ${err instanceof Error ? err.message.slice(0, 120) : 'hata'}`
    }
  } else note = 'AI editör kapalı (STORY_AI / Gemini anahtarı)'
  const plan = parsePlan(raw, p, newId)
  if (plan.source === 'fallback' && !note) note = 'AI cevabı okunamadı; metin cümlelere bölündü'
  return { ...plan, note }
}

/**
 * 3 / 5 / 10 minutes: (1) the script in a fixed number of sections — unless the editor wrote
 * one — then (2) split locally into scenes and (3) the AI picks visuals / shot notes for the
 * numbered scenes. A single «write N minutes and plan it» call came back ~1 minute long.
 */
async function planLongStory(p: StoryProject, newId: () => string): Promise<PlanResult & { note: string | null }> {
  const t = p.targetMin
  let note: string | null = null
  let script = p.script.trim()
  let title: string | null = null
  if (!script) {
    if (!storyAiReady().text) return { title: null, caption: null, scenes: [], source: 'fallback', note: 'AI editör kapalı: uzun video için anlatım metnini kendiniz yazın' }
    const ask = async (extra: string) =>
      geminiFastChat({
        messages: [
          { role: 'system', content: scriptSystemPrompt(t) },
          { role: 'user', content: `Konu: ${p.topic || p.title}\nBaşlık: ${p.title || '-'}${extra}` },
        ],
        temperature: 0.6,
        maxTokens: 4000 + longSections(t) * 450,
        timeoutMs: 150_000,
        jsonMode: true,
        telemetry: { agentName: 'story_writer', operation: 'story_script' },
      }).then((r) => parseLongScript(r.text))
    try {
      let s = await ask('')
      // too short (fewer sections or thin ones): ask once more, saying what was missing
      const want = longSections(t) * SECTION_CHARS
      const have = s.sections.join(' ').length
      if (have < want * 0.75) {
        const again = await ask(`\n\nÖnceki denemede metin çok kısa kaldı (${have} karakter). Bu kez ${longSections(t)} bölümün HER BİRİ ${SECTION_CHARS - 40}–${SECTION_CHARS + 40} karakter olsun; toplam yaklaşık ${want} karakter.`).catch(() => null)
        if (again && again.sections.join(' ').length > have) s = again
      }
      script = s.sections.join(' ')
      title = s.title
      const sec = Math.round(script.length / 14.5)
      if (script.length < want * 0.6) note = `AI metni hedeften kısa yazdı (~${Math.floor(sec / 60)} dk ${sec % 60} sn); «AI ile planla» ile yeniden deneyin ya da metni «Proje» sekmesinde uzatın`
    } catch (err) {
      return { title: null, caption: null, scenes: [], source: 'fallback', note: `AI editör metni yazamadı: ${err instanceof Error ? err.message.slice(0, 120) : 'hata'}` }
    }
  }
  const texts = longScenes(script)
  let raw: string | null = null
  try {
    const r = await geminiFastChat({
      messages: [
        { role: 'system', content: visualsSystemPrompt({ format: p.format }) },
        { role: 'user', content: visualsUserPrompt(texts, p) },
      ],
      temperature: 0.4,
      maxTokens: 2000 + texts.length * 160,
      timeoutMs: 150_000,
      jsonMode: true,
      telemetry: { agentName: 'story_planner', operation: 'story_visuals' },
    })
    raw = r.text
  } catch (err) {
    note = note ?? `Görüntü seçimi yapılamadı (${err instanceof Error ? err.message.slice(0, 80) : 'hata'}); sahneler metin kartı`
  }
  const plan = parseVisuals(raw, texts, p, newId)
  return { ...plan, title: plan.title ?? title, ...(p.script.trim() ? {} : { script: script.slice(0, 12000) }), note }
}

// ── illustration (paid) ──────────────────────────────────────────────────────

export class StoryBudgetError extends Error {
  constructor(public readonly used: number, public readonly budget: number) {
    super(`Yapay zekâ çizim aylık bütçesi doldu (${used.toFixed(2)} / ${budget.toFixed(2)} $). Yönetici STORY_IMAGE_BUDGET_USD değerini artırabilir.`)
    this.name = 'StoryBudgetError'
  }
}

export function imagePriceUsd(): number {
  const v = Number(process.env.STORY_IMAGE_USD)
  return Number.isFinite(v) && v > 0 ? v : 0.07
}
export function imageBudgetUsd(): number {
  const v = Number(process.env.STORY_IMAGE_BUDGET_USD)
  return Number.isFinite(v) && v >= 0 ? v : 15
}
const month = () => new Date().toISOString().slice(0, 7)

export async function storyImageUsage(): Promise<{ month: string; usd: number; images: number; budget: number; price: number }> {
  const d = (await getAdminFirestore().collection(USAGE).doc(month()).get()).data() ?? {}
  return { month: month(), usd: Number(d.imageUsd ?? 0), images: Number(d.images ?? 0), budget: imageBudgetUsd(), price: imagePriceUsd() }
}

async function reserve(usd: number): Promise<void> {
  const ref = getAdminFirestore().collection(USAGE).doc(month())
  const budget = imageBudgetUsd()
  await getAdminFirestore().runTransaction(async (tx) => {
    const used = Number((await tx.get(ref)).data()?.imageUsd ?? 0)
    if (used + usd > budget + 1e-9) throw new StoryBudgetError(used, budget)
    tx.set(ref, { imageUsd: FieldValue.increment(usd), images: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true })
  })
}
async function refund(usd: number): Promise<void> {
  await getAdminFirestore().collection(USAGE).doc(month()).set({ imageUsd: FieldValue.increment(-usd), images: FieldValue.increment(-1) }, { merge: true }).catch(() => undefined)
}

function imageModels(): string[] {
  const env = process.env.STORY_IMAGE_MODEL?.trim()
  return [...new Set([env, 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'].filter(Boolean) as string[])]
}

type ImgResp = { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> }; finishReason?: string }>; promptFeedback?: { blockReason?: string }; error?: { message?: string; status?: string } }

/** One 9:16 illustration; returns image bytes. Charged against the monthly budget. */
export async function generateIllustration(prompt: string, style: StoryStyle, format: StoryFormat = 'vertical'): Promise<{ bytes: Buffer; mime: string; model: string }> {
  const key = getGeminiApiKey()
  if (!key || !storyAiReady().images) throw new Error('Yapay zekâ çizim kapalı')
  const price = imagePriceUsd()
  await reserve(price)
  let lastErr = 'Çizim üretilemedi'
  try {
    for (const model of imageModels()) {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: illustrationPrompt(prompt, style, format) }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: format === 'horizontal' ? '16:9' : '9:16' } },
        }),
        signal: AbortSignal.timeout(90_000),
      })
      const j = (await res.json().catch(() => null)) as ImgResp | null
      if (res.status === 404 || (res.status === 400 && /not found|not supported|unknown model/i.test(j?.error?.message ?? ''))) {
        lastErr = `Model kullanılamıyor: ${model}`
        continue
      }
      if (!res.ok || !j) throw new Error(`Gemini çizim hatası (${res.status}${j?.error?.message ? `: ${j.error.message.slice(0, 140)}` : ''})`)
      if (j.promptFeedback?.blockReason) throw new Error(`Çizim isteği güvenlik filtresine takıldı (${j.promptFeedback.blockReason}); tarifi değiştirin`)
      for (const part of j.candidates?.[0]?.content?.parts ?? []) {
        const d = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined)
        if (d?.data) return { bytes: Buffer.from(d.data, 'base64'), mime: d.mimeType || 'image/png', model }
      }
      throw new Error(`Gemini görsel döndürmedi (${j.candidates?.[0]?.finishReason ?? 'boş cevap'}); tarifi değiştirip tekrar deneyin`)
    }
    throw new Error(lastErr)
  } catch (err) {
    await refund(price)
    throw err
  }
}
