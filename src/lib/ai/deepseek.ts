/**
 * DeepSeek V3 — News Generator / Collector
 *
 * Görevleri: kaynak analiz, duplicate tespiti, içerik zenginleştirme,
 * benzer haberleri birleştirme, ham kayıt kalite puanı
 *
 * API: OpenAI-compatible (https://api.deepseek.com/v1/chat/completions)
 * Env: DEEPSEEK_API_KEY
 */

import type { DeepSeekCollectResult } from './types'

const DEEPSEEK_MODEL = 'deepseek-chat'   // DeepSeek-V3
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'

// ── Config ────────────────────────────────────────────────────────────────────
function getConfig(): { apiKey: string } | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  return { apiKey }
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(getConfig())
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen NaHaber'in Haber Toplama ve Analiz Yapay Zekasısın.

GÖREVLER:
1. Ham haber kaynağını analiz et
2. Duplicate/benzer haber tespiti için skor ver (0-100)
3. İçeriği zenginleştir — ek bağlam, arka plan bilgisi ekle
4. Temel gerçekleri (key facts) çıkar
5. Duygu analizi yap (sentiment)
6. Aciliyet skoru ver (urgency 0-100)
7. Ham kaynak kalite skoru ver (quality 0-100)

KURALLAR:
- JSON formatında yanıt ver
- Türkçe düşün
- Abartma, clickbait, spekülasyon ekleme
- Gerçek bilgilerle zenginleştir
- Sadece JSON döndür`

// ── API call ──────────────────────────────────────────────────────────────────
async function callDeepSeek(messages: Array<{ role: string; content: string }>): Promise<string> {
  const cfg = getConfig()
  if (!cfg) throw new Error('DEEPSEEK_API_KEY eksik')

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`DeepSeek API ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }

  if (data.error) throw new Error(`DeepSeek error: ${data.error.message}`)

  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('DeepSeek boş yanıt döndürdü')
  return content
}

// ── Collect & analyze ─────────────────────────────────────────────────────────
export interface DeepSeekCollectInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  /** Previously seen article titles for duplicate detection */
  recentTitles?: string[]
}

export async function deepseekCollect(input: DeepSeekCollectInput): Promise<DeepSeekCollectResult> {
  const recentTitlesSection = input.recentTitles?.length
    ? `\nSON HABERLER (duplicate kontrolü için):\n${input.recentTitles.slice(0, 10).join('\n')}`
    : ''

  const userMessage = `Aşağıdaki haberi analiz et:

KAYNAK: ${input.sourceLabel}
BAŞLIK: ${input.originalTitle}
ÖZET: ${input.originalSummary}
İÇERİK: ${input.originalContent.slice(0, 2000)}${recentTitlesSection}

JSON formatında döndür:
{
  "isDuplicate": boolean (son haberlerden biriyle aynı içerik mi?),
  "duplicateScore": number (0-100, benzerlik skoru),
  "shouldMerge": boolean (birleştirilebilecek benzer haber var mı?),
  "enrichedContent": "string (orijinal içerik + ek bağlam/arka plan, Türkçe)",
  "keyFacts": ["string", ...] (3-7 temel gerçek),
  "sentiment": "positive|negative|neutral",
  "urgencyScore": number (0-100, aciliyet),
  "qualityScore": number (0-100, kaynak kalitesi)
}`

  const raw = await callDeepSeek([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ])

  const p = JSON.parse(raw) as Partial<DeepSeekCollectResult> & Record<string, unknown>

  return {
    isDuplicate: p.isDuplicate === true,
    duplicateScore: typeof p.duplicateScore === 'number' ? Math.min(100, Math.max(0, p.duplicateScore)) : 0,
    shouldMerge: p.shouldMerge === true,
    enrichedContent: typeof p.enrichedContent === 'string' && p.enrichedContent.trim()
      ? p.enrichedContent.trim()
      : input.originalContent,
    keyFacts: Array.isArray(p.keyFacts) ? p.keyFacts.map(String).slice(0, 7) : [],
    sentiment: (['positive', 'negative', 'neutral'] as const).includes(p.sentiment as never)
      ? (p.sentiment as DeepSeekCollectResult['sentiment'])
      : 'neutral',
    urgencyScore: typeof p.urgencyScore === 'number' ? Math.min(100, Math.max(0, p.urgencyScore)) : 50,
    qualityScore: typeof p.qualityScore === 'number' ? Math.min(100, Math.max(0, p.qualityScore)) : 60,
    processedAt: Date.now(),
    modelUsed: DEEPSEEK_MODEL,
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkDeepSeekHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const cfg = getConfig()
    if (!cfg) return { ok: false, latencyMs: 0, error: 'DEEPSEEK_API_KEY eksik' }

    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      }),
    })
    return { ok: res.ok, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) }
  }
}
