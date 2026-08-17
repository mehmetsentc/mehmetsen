import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'

interface SeoBackfillResult {
  scanned: number
  updated: number
  skipped: number
  errors: number
}

interface GeneratedSeo {
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string[]
}

const SYSTEM_PROMPT = `Sen Türk haber sitesi SEO uzmanısın. Verilen haber için arama motoru optimizasyonu metinleri üret.
JSON: {"seoTitle":"...","seoDescription":"...","seoKeywords":["..."]}
seoTitle: 50-60 karakter, Türkçe, tıklanabilir ama clickbait değil.
seoDescription: 145-160 karakter, özet niteliğinde.
seoKeywords: 8-12 anahtar kelime, küçük harf Türkçe.`

async function generateSeo(input: {
  title: string
  summary: string
  content: string
}): Promise<GeneratedSeo | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  const userMessage = [
    `Başlık: ${input.title}`,
    '',
    'Özet:',
    input.summary.slice(0, 400),
    '',
    'İçerik:',
    input.content.slice(0, 2000),
  ].join('\n')

  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: 0.4,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) {
      recordDirectDeepSeekObservation({
        agentName: 'seo_backfill',
        operation: 'generate_seo',
        promptVersion: 'seo-backfill:v1',
        model,
        startedAt,
        success: false,
        statusCode: res.status,
      })
      return null
    }
    const json = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: unknown }
    const raw = json.choices[0]?.message?.content?.trim()
    recordDirectDeepSeekObservation({
      agentName: 'seo_backfill',
      operation: 'generate_seo',
      promptVersion: 'seo-backfill:v1',
      model,
      startedAt,
      success: Boolean(raw),
      statusCode: 200,
      body: json,
      errorMessage: raw ? undefined : 'empty_content',
    })
    if (!raw) return null
    const parsed = JSON.parse(raw) as GeneratedSeo
    return {
      seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle.trim().slice(0, 70) : undefined,
      seoDescription:
        typeof parsed.seoDescription === 'string' ? parsed.seoDescription.trim().slice(0, 165) : undefined,
      seoKeywords: Array.isArray(parsed.seoKeywords)
        ? parsed.seoKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 15)
        : undefined,
    }
  } catch (err) {
    recordDirectDeepSeekObservation({
      agentName: 'seo_backfill',
      operation: 'generate_seo',
      promptVersion: 'seo-backfill:v1',
      model,
      startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : 'seo_failed',
    })
    return null
  }
}

function needsSeo(data: Record<string, unknown>): boolean {
  const title = typeof data.seoTitle === 'string' ? data.seoTitle.trim() : ''
  const desc = typeof data.seoDescription === 'string' ? data.seoDescription.trim() : ''
  return !title || !desc
}

export async function backfillArticleSeo(limit = 40): Promise<SeoBackfillResult> {
  const db = getAdminFirestore()
  const snap = await db
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(Math.min(limit * 3, 300))
    .get()

  const result: SeoBackfillResult = { scanned: 0, updated: 0, skipped: 0, errors: 0 }

  for (const doc of snap.docs) {
    if (result.updated >= limit) break
    const data = doc.data() as Record<string, unknown>
    if (!needsSeo(data)) {
      result.skipped++
      continue
    }

    result.scanned++
    const title = String(data.title ?? '').trim()
    const content = String(data.content ?? data.description ?? '').trim()
    const summary = String(data.summary ?? content.slice(0, 280)).trim()
    if (!title) {
      result.skipped++
      continue
    }

    const generated = await generateSeo({ title, summary, content })
    if (!generated?.seoTitle && !generated?.seoDescription) {
      result.errors++
      continue
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() }
    if (generated.seoTitle) updates.seoTitle = generated.seoTitle
    if (generated.seoDescription) updates.seoDescription = generated.seoDescription
    if (generated.seoKeywords?.length) updates.seoKeywords = generated.seoKeywords

    await doc.ref.update(updates)
    result.updated++
  }

  return result
}
