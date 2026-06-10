/**
 * GPT-4o — Senior Editor / Quality Assurance
 *
 * Görevleri: Gemini çıktısını son kez kontrol et, dil bilgisi,
 * SEO, mobil okunabilirlik, Google News uyumu, push notification,
 * kalite puanı düşük haberleri reddet
 *
 * API: OpenAI (mevcut OPENAI_API_KEY kullanır)
 * Env: OPENAI_API_KEY, OPENAI_QA_MODEL (varsayılan: gpt-4o-mini)
 */

import type { GeminiEditResult, GptQaResult } from './types'

const DEFAULT_QA_MODEL = 'gpt-4o-mini'

// ── Config ────────────────────────────────────────────────────────────────────
function getConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.OPENAI_QA_MODEL?.trim() || DEFAULT_QA_MODEL
  return { apiKey, model }
}

export function isGptConfigured(): boolean {
  return Boolean(getConfig())
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen NaHaber'in Kıdemli Haber Editörüsün. Yapay zeka editörünün hazırladığı haberleri son kalite kontrolünden geçiriyorsun.

DEĞERLENDİRME KRİTERLERİ:
1. Dil bilgisi ve Türkçe doğruluğu (grammarScore 0-100)
2. Anlatım akıcılığı ve okunabilirlik (readabilityScore 0-100)
3. SEO uyumluluğu (seoScore 0-100)
4. Doğruluk ve güvenilirlik (accuracyScore 0-100)
5. Mobil okunabilirlik (mobileScore 0-100)
6. Google News uyumluluğu (googleNewsScore 0-100)
7. Google Discover uyumluluğu (googleDiscoverScore 0-100)

KARAR:
- approved: tüm skorlar 60+, yayına hazır
- needs_revision: skorlar 40-59, düzeltme gerekli
- rejected: herhangi bir skor 40 altı, veya clickbait/yanıltıcı/spam

YANIT: Yalnızca JSON döndür.`

// ── QA check ──────────────────────────────────────────────────────────────────
export async function gptQaCheck(article: GeminiEditResult): Promise<GptQaResult> {
  const cfg = getConfig()
  if (!cfg) throw new Error('OPENAI_API_KEY eksik')

  const userMessage = `Aşağıdaki haberi değerlendir:

BAŞLIK: ${article.title}
ÖZET: ${article.summary}
İÇERİK (ilk 1000 karakter): ${article.content.slice(0, 1000)}
KATEGORİ: ${article.category}
SEO BAŞLIK: ${article.metaTitle}
SEO AÇIKLAMA: ${article.metaDescription}
KALİTE SKORU (Gemini): ${article.qualityScore}
SEO SKORU (Gemini): ${article.seoScore}

JSON formatında döndür:
{
  "decision": "approved|needs_revision|rejected",
  "score": number (0-100 genel skor),
  "grammarScore": number (0-100),
  "readabilityScore": number (0-100),
  "seoScore": number (0-100),
  "accuracyScore": number (0-100),
  "mobileScore": number (0-100),
  "googleNewsScore": number (0-100),
  "googleDiscoverScore": number (0-100),
  "issues": ["string", ...] (tespit edilen sorunlar),
  "suggestions": ["string", ...] (iyileştirme önerileri),
  "revisedTitle": "string veya null" (başlık düzeltme önerisi),
  "revisedDescription": "string veya null" (açıklama düzeltme önerisi),
  "pushTitle": "string (50 karakter, bildirim başlığı)",
  "pushBody": "string (100 karakter, bildirim metni)"
}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`OpenAI QA API ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }

  if (data.error) throw new Error(`OpenAI QA error: ${data.error.message}`)

  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI QA boş yanıt döndürdü')

  const p = JSON.parse(content) as Partial<GptQaResult> & Record<string, unknown>

  const num = (v: unknown, fallback = 70) =>
    typeof v === 'number' ? Math.min(100, Math.max(0, v)) : fallback
  const str = (v: unknown, fallback = '') =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback

  const decision = (['approved', 'rejected', 'needs_revision'] as const).includes(p.decision as never)
    ? (p.decision as GptQaResult['decision'])
    : 'approved'

  return {
    decision,
    score: num(p.score, 75),
    grammarScore: num(p.grammarScore, 75),
    readabilityScore: num(p.readabilityScore, 75),
    seoScore: num(p.seoScore, 75),
    accuracyScore: num(p.accuracyScore, 75),
    mobileScore: num(p.mobileScore, 75),
    googleNewsScore: num(p.googleNewsScore, 75),
    googleDiscoverScore: num(p.googleDiscoverScore, 75),
    issues: Array.isArray(p.issues) ? p.issues.map(String).slice(0, 5) : [],
    suggestions: Array.isArray(p.suggestions) ? p.suggestions.map(String).slice(0, 5) : [],
    revisedTitle: str(p.revisedTitle) || undefined,
    revisedDescription: str(p.revisedDescription) || undefined,
    pushTitle: str(p.pushTitle, article.pushTitle).slice(0, 60),
    pushBody: str(p.pushBody, article.pushBody).slice(0, 120),
    processedAt: Date.now(),
    modelUsed: cfg.model,
  }
}

// ── Fallback QA (when OpenAI unavailable) ─────────────────────────────────────
export function gptQaFallback(article: GeminiEditResult): GptQaResult {
  const score = Math.round((article.qualityScore + article.seoScore) / 2)
  return {
    decision: score >= 50 ? 'approved' : 'rejected',
    score,
    grammarScore: 70,
    readabilityScore: 70,
    seoScore: article.seoScore,
    accuracyScore: article.factCheckScore,
    mobileScore: 75,
    googleNewsScore: article.seoScore,
    googleDiscoverScore: article.seoScore,
    issues: [],
    suggestions: [],
    pushTitle: article.pushTitle,
    pushBody: article.pushBody,
    processedAt: Date.now(),
    modelUsed: 'fallback',
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkGptHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const cfg = getConfig()
    if (!cfg) return { ok: false, latencyMs: 0, error: 'OPENAI_API_KEY eksik' }

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    })
    return { ok: res.ok, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) }
  }
}
