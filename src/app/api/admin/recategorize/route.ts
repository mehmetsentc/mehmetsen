/**
 * GET/POST /api/admin/recategorize
 * Re-classifies existing articles using GPT + heuristics.
 * Bearer token required (CRON_SECRET). Vercel cron uses GET daily.
 *
 * Body (POST) / query (GET): { limit?: number; dryRun?: boolean }
 * Re-categorizes articles that still have categoryId='ekonomi' OR low confidence.
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { validateCategoryClassification } from '@/services/newsroom/categoryEngine'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'

export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${CRON_SECRET}` && CRON_SECRET.length > 0
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? ''

async function classifyWithGpt(title: string, content: string): Promise<string | null> {
  const { mayAutomatedCrawlerUseAi } = await import('@/services/crawler/automatedAiPolicy')
  if (!mayAutomatedCrawlerUseAi()) return null
  if (!DEEPSEEK_API_KEY) return null
  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 60,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `Türkçe haber kategori sınıflandırıcısı. Haberin başlığını ve içeriğini analiz et, EN uygun kategoriyi döndür.

Kategoriler (slug):
- teknoloji: Apple, iPhone, Android, iOS, yapay zeka, AI, uygulama, güncelleme, sosyal medya, Twitter, TikTok, Google, Microsoft, Tesla, siber, uzay, drone, oyun
- siyaset: cumhurbaşkanı, meclis, TBMM, seçim, AKP, CHP, MHP, HDP, DEM, bakan, milletvekili, belediye başkanı, muhalefet, hükümet, koalisyon, siyasi
- ekonomi: borsa, döviz, dolar, euro, faiz, enflasyon, TCMB, bütçe, ihracat, işsizlik, kripto, bitcoin, hisse, piyasa, şirket kârı
- spor: futbol, maç, gol, lig, transfer, milli takım, basketbol, tenis, FIFA, UEFA, şampiyonluk
- saglik: sağlık, hastalık, ilaç, aşı, hastane, kanser, salgın, tedavi
- dunya: yurt dışı, ABD, Avrupa, Rusya, Çin, savaş (Türkiye dışı), NATO, BM, uluslararası
- kultur: sinema, film, tiyatro, müzik albümü, kitap, sanat, sergi, edebiyat
- magazin: ünlü, dizi fragmanı, dedikodu, oyuncu hayatı, evlilik, ayrılık
- son-dakika: deprem, büyük afet, darbe girişimi, suikast
- yerel-haber: yalnızca belirli bir il/ilçeyi kapsayan olay
- gundem: yukarıdakilere girmeyen Türkiye iç gündemi

SADECE JSON döndür: {"category":"<slug>"}`,
          },
          {
            role: 'user',
            content: `Başlık: ${title}\n\nİçerik (ilk 600 karakter): ${content.slice(0, 600)}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      recordDirectDeepSeekObservation({
        agentName: 'recategorize',
        operation: 'recategorize_article',
        promptVersion: 'recategorize:v1',
        startedAt,
        success: false,
        statusCode: res.status,
      })
      return null
    }
    const json = await res.json()
    const text = json.choices?.[0]?.message?.content ?? '{}'
    recordDirectDeepSeekObservation({
      agentName: 'recategorize',
      operation: 'recategorize_article',
      promptVersion: 'recategorize:v1',
      startedAt,
      success: Boolean(text && text !== '{}'),
      statusCode: 200,
      body: json,
    })
    const parsed = JSON.parse(text)
    return typeof parsed.category === 'string' ? parsed.category : null
  } catch (err) {
    recordDirectDeepSeekObservation({
      agentName: 'recategorize',
      operation: 'recategorize_article',
      promptVersion: 'recategorize:v1',
      startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : 'recategorize_failed',
    })
    return null
  }
}

async function runRecategorize(opts: { limit?: number; dryRun?: boolean }) {
  const limit = Math.min(opts.limit ?? 50, 200)
  const dryRun = opts.dryRun ?? false

  const db = getAdminFirestore()
  const startMs = Date.now()

  // Fetch recently published articles with low-confidence or ekonomi category
  // We target articles that might be miscategorized
  const snap = await db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(limit * 3) // fetch more, filter client-side
    .get()

  const candidates = snap.docs.filter((d) => {
    const data = d.data()
    const conf = (data.categoryConfidence as number) ?? 100
    // Re-check all low-confidence articles regardless of category
    return conf < 85 || !data.recategorizedAt
  }).slice(0, limit)

  let updated = 0
  let unchanged = 0
  let failed = 0
  const changes: Array<{ id: string; title: string; old: string; new: string; method: string }> = []

  for (const doc of candidates) {
    const data = doc.data()
    const title = (data.title as string) ?? ''
    const content = ((data.content as string) ?? (data.summary as string) ?? '')
    const oldCategory = (data.categoryId as string) ?? 'gundem'

    try {
      // Step 1: heuristic validation (fast, no API cost)
      const heuristic = validateCategoryClassification({
        aiCategoryId: oldCategory,
        categoryConfidence: (data.categoryConfidence as number) ?? 70,
        aiIsBreaking: data.isBreaking as boolean,
        title,
        body: content.slice(0, 1000),
      })

      let newCategory = heuristic.categoryId
      let method = 'heuristic'

      // Step 2: if heuristic didn't change it, call GPT
      if (newCategory === oldCategory && DEEPSEEK_API_KEY) {
        const gptCategory = await classifyWithGpt(title, content)
        if (gptCategory && gptCategory !== oldCategory) {
          // Final heuristic pass on GPT result
          const gptValidated = validateCategoryClassification({
            aiCategoryId: gptCategory,
            categoryConfidence: 85,
            aiIsBreaking: data.isBreaking as boolean,
            title,
            body: content.slice(0, 1000),
          })
          newCategory = gptValidated.categoryId
          method = 'gpt'
        }
      }

      if (newCategory !== oldCategory) {
        changes.push({ id: doc.id, title: title.slice(0, 60), old: oldCategory, new: newCategory, method })
        if (!dryRun) {
          await doc.ref.update({ categoryId: newCategory, recategorizedAt: Date.now() })
        }
        updated++
      } else {
        unchanged++
      }
    } catch (err) {
      console.error('[recategorize] failed', doc.id, err)
      failed++
    }
  }

  return {
    checked: candidates.length,
    updated,
    unchanged,
    failed,
    dryRun,
    durationMs: Date.now() - startMs,
    changes,
  }
}

/** Vercel Cron (GET + Bearer CRON_SECRET) — günlük düşük-güven kategori düzeltme. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') || 50)
  const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true'
  const result = await runRecategorize({
    limit: Number.isFinite(limit) ? limit : 50,
    dryRun,
  })
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { limit?: number; dryRun?: boolean } = {}
  try { body = await request.json() } catch { /* ignore */ }

  const result = await runRecategorize(body)
  return NextResponse.json(result)
}
