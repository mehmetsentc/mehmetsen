import { NextResponse } from 'next/server'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { generateImageAnalysis, type ImageAnalysis } from '@/lib/ai/imageSeo'
import { researchLiveNews } from '@/lib/ai/liveResearch'
import { DEFAULT_CATEGORIES, isKibrisCategoryTree } from '@/constants/config'
import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'
import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { getAiEditorById } from '@/lib/ai/editorial/aiEditorService'
import { buildEditorPrompt } from '@/lib/ai/editorial/promptBuilder'
import { routeEditorial } from '@/lib/ai/editorial/editorRouter'
import { stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'
import type { AiPromptType } from '@/types/aiEditor'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { resolveCountryFromText } from '@/constants/countries'
import { deriveSeoKeywords, extractSeoKeywordsFromAiPayload } from '@/lib/seoKeywords'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type AssistMode =
  | 'create'
  | 'rewrite'
  | 'publish-ready'
  | 'seo'
  | 'tags'
  | 'headline'
  | 'trends'
  | 'keywords'

type ArticleFormatAssist = 'standard' | 'column' | 'analysis'

const CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((category) => category.id))

/** AI bazen <p>…</p> sızdırıyor — CMS önizlemede ham etiket görünmesin. */
function stripAiHtmlLeak(text: string): string {
  return stripHtmlToNewsPlainText(text)
}

/** Truncate text at the last word boundary within maxLen. */
function clampAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSp = cut.lastIndexOf(' ')
  return lastSp > maxLen * 0.6 ? cut.slice(0, lastSp) : cut
}

/** Truncate text at the last sentence-ending punctuation within maxLen. */
function clampAtSentenceBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const ends = [cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')]
  const best = Math.max(...ends)
  if (best > maxLen * 0.55) return cut.slice(0, best + 1)
  const sp = cut.lastIndexOf(' ')
  return sp > maxLen * 0.6 ? cut.slice(0, sp) : cut
}

const CATEGORY_LIST = DEFAULT_CATEGORIES.map((category) => `${category.id}: ${category.name}`).join(', ')

/** CMS tek-tuş: editör tarzı + net manşet, JSON şeması korunur */
const PERSONA_ATTENTION_LOCK = `
CMS TEK-TUŞ GÖREVİ — UZMAN AI EDİTÖR:
- Bu AI editörün karakter, ton ve yazım talimatlarına SIKI uy; genel anonim haber dili kullanma
- Manşet net, spesifik ve doğru olsun; uydurma / abartılı clickbait / "şok" clickbait YASAK
- Spot okuyucuyu ilk 2 cümlede bilgilendirsin; 5W+1H eksiksiz
- Gövde editörün tarzında olsun (kelime seçimi, tempo, vurgu); ansiklopedi / okul kompozisyonu yazma
- Kaynakta olmayan sayı, alıntı, olay uydurma
- content: ## H2 kullan (# H1 yok); en fazla 2-3 kısa bölüm; 250-450 kelime hedef (asgari ~220)
- HTML (<p>, <div>, <br>…) ASLA — yalnızca düz metin + markdown
- summary en fazla 280 karakter
- seoTitle KESİNLİKLE 50-65 karakter arasında olsun; 65 karakteri ASLA AŞMA
- seoDescription KESİNLİKLE 140-165 karakter arasında olsun; 165 karakteri ASLA AŞMA
- categoryId geçerli kimliklerden biri; tags 5-8
- seoKeywords ZORUNLU: 8-15 Türkçe SEO anahtar kelimesi; bu alan ASLA boş bırakılmasın
- imageOrder yalnızca verilen görsel URL'lerini içersin
`.trim()

const PUBLISH_JSON_SCHEMA = `
Yalnızca şu JSON şemasını döndür:
{"title":"...","spot":"...","summary":"...","content":"...","seoTitle":"...","seoDescription":"...","categoryId":"...","tags":["..."],"seoKeywords":["..."],"imageOrder":["..."]}
Geçerli kategoriler: ${CATEGORY_LIST}
`.trim()

const SYSTEM_PROMPTS: Record<AssistMode, string> = {
  create: `Sen deneyimli bir Türk gazetecisisin. Verilen konuda profesyonel bir haber metni yaz.
JSON formatında yanıt ver: {"title":"...","content":"...","summary":"...","spot":"..."}
spot: 5W+1H (Kim,Ne,Nerede,Ne Zaman,Neden,Nasıl) yanıtlayan 2-4 cümlelik haber girizgahı; spot yalnızca bu alanda, content içinde TEKRAR etme.
content kuralları:
- ## H2 ve ### H3 kullan; # H1 KULLANMA
- HTML etiketleri (<p>, <div>, <br> vb.) ASLA yazma
- Her başlık kendi satırında olsun, en fazla 6 kelime; manşet cümlesi, spot veya görsel caption'ını başlık yapma
- Başlıktan sonra boş satır bırak, sonra tam paragraf
- Başlık ile paragrafı aynı satıra veya bitişik yapıştırma
- content içinde kapak görseli veya spot/giriş paragrafı tekrarı yazma; gövde doğrudan ilk ## bölümüyle başlasın
- MUTLAK TAMLIK: Her cümle/paragraf/başlık eksiksiz bitsin. Kelime ortasında kesme. "ve/ile/için/olan" ile bitirme. "..." ile başlayan yarım paragraf yasak. Token sınırında yeni bölüm açma; son cümleyi nokta ile tamamla.`,

  rewrite: `Sen deneyimli bir Türk gazete editörüsün. Verilen haberi yeniden yaz, daha akıcı ve profesyonel yap.
JSON: {"title":"...","content":"...","summary":"...","spot":"..."}
content kuralları: ## / ### başlıklar kendi satırında (max 6 kelime), ardından boş satır + tam paragraf; # H1 yok; HTML (<p> vb.) yasak; spot ve giriş paragrafını content'e kopyalama; görsel caption'ını H2/H3 yapma.
MUTLAK: Yarım cümle, kesilmiş kelime veya bağlaçla biten paragraf bırakma; her birimi noktalama ile tamamla.`,

  'publish-ready': `Sen NaHaber'in deneyimli genel yayın yönetmenisin. Kullanıcının verdiği ham metni yayıma hazır, kapsamlı ve bilgilendirici bir Türkçe habere dönüştür.
Kurallar:
- Ana başlık güçlü, doğru ve clickbait olmayan bir manşet olsun.
- spot 5W+1H'yi karşılayan 2-4 cümle olsun; spot yalnızca spot alanında, content içinde tekrar etmesin.
- summary en fazla 280 karakter olsun.
- content KAPSAMLI ve BİLGİLENDİRİCİ olsun:
  * En az 4-6 bölüm (## H2) yaz; her bölüm 2-3 tam paragraf içersin
  * Haberin arka planını, önemini ve bağlamını açıkla
  * Konuyla ilgili genel bilgileri, tarihi bağlamı ve önemi ekle
  * Okuyucuya haberin neden önemli olduğunu anlat
  * Kapak görseli veya manşet açıklamasını content'e ekleme
- content markdown yapısı ZORUNLU:
  * HTML etiketleri (<p>, <div>, <br>, <span> vb.) ASLA yazma — yalnızca düz metin + ## / ### markdown
  * ## H2 ve gerektiğinde ### H3 kullan; # H1 ASLA kullanma
  * Her başlık haber konusunu özetleyen bağımsız bir etiket olsun; ZORUNLU: en fazla 6 kelime
  * Görsel açıklaması (caption/alt), kişi-yer adı listesi veya uzun cümle başlık OLAMAZ
  * Başlıktan sonra bir boş satır, sonra tam ve eksiksiz paragraf
  * "### BaşlıkParagraf" gibi bitişik yazım YASAK
  * ZORUNLU TAMLIK: Her cümle nokta/ünlem/soru ile bitsin. Kelime ortasında kesme ("gerçek", "yabanc") yasak. "ve/ile/için/olan" ile bitirme. "..." ile başlayan paragraf yasak.
  * Token sınırına yaklaşırsan yeni H2 açma; son cümleyi tamamlayıp bitir.
  * Aynı paragrafı veya spot cümlesini content içinde iki kez yazma
  * İlk satır doğrudan ## ile başlayan ilk bölüm olsun (giriş/spot paragrafı content'te olmasın)
- Ham metindeki spesifik iddiaları (alıntı, sayı, tarih) olduğu gibi koru; genel bağlam ve arka plan bilgisini zenginleştirerek ekle.
- CANLI ARAŞTIRMA NOTLARI varsa bu notlardaki bilgileri öncelikli olarak kullan ve içeriğe entegre et.
- Çelişkili veya tek kaynağa dayanan iddiaları kesin bilgi gibi sunma.
- Araştırma notundaki ham URL'leri haber gövdesine yapıştırma; gerektiğinde kaynağı kurum adıyla belirt.
- GÖRSEL YASAĞI: Görsel analizindeki caption veya alt metni haber gövdesinde H2/H3 başlık, paragraf veya alıntı olarak ASLA yazma; bu veriler yalnızca imageOrder sıralaması içindir.
- seoTitle KESİNLİKLE 50-65 karakter arasında olsun; 65 karakteri ASLA AŞMA.
- seoDescription KESİNLİKLE 140-165 karakter arasında olsun; 165 karakteri ASLA AŞMA.
- seoKeywords ZORUNLU: 8-15 Türkçe SEO anahtar kelimesi üret; bu alan ASLA boş bırakılmasın.
- categoryId aşağıdaki geçerli kimliklerden tam biri olsun.
- Kategori seçiminde EN SPESİFİK alt kategoriyi kullan:
  * Burç / günlük burç / haftalık burç / zodyak / yükselen / Koç|Boğa|İkizler|Yengeç|Aslan|Başak|Terazi|Akrep|Yay|Oğlak|Kova|Balık burcu → categoryId: "astroloji" (ASLA "yasam" değil)
  * Moda/giyim → "moda"; anne-çocuk → "anne-cocuk"; dekorasyon → "dekorasyon"; ilişki rehberi → "iliskiler"
  * "yasam" yalnızca yaşam alt dalı belirsizse
- tags 5-8, seoKeywords 8-15 Türkçe ifade olsun.
- imageOrder yalnızca verilen görsel URL'lerini içersin; en ilgili kapak görseli ilk sırada olsun.
Geçerli kategoriler: ${CATEGORY_LIST}
Yalnızca şu JSON şemasını döndür:
{"title":"...","spot":"...","summary":"...","content":"...","seoTitle":"...","seoDescription":"...","categoryId":"...","tags":["..."],"seoKeywords":["..."],"imageOrder":["..."]}`,

  seo: `Sen bir SEO uzmanısın. Verilen haber başlığı için SEO meta verisi oluştur.
JSON: {"seoTitle":"...","seoDescription":"..."}
seoTitle: 50-60 karakter. seoDescription: 150-160 karakter. Türkçe olsun.`,

  tags: `Verilen haber için en uygun etiketleri oluştur.
JSON: {"tags":["tag1","tag2",...]} — en fazla 8 etiket, Türkçe, küçük harf.`,

  headline: `Verilen haber içeriği için 5 farklı başlık alternatifi oluştur.
JSON: {"headlines":["başlık1","başlık2","başlık3","başlık4","başlık5"]}`,

  trends: `Türkiye gündemindeki trend konuları analiz et ve haber fikirleri sun.
JSON: {"trends":[{"topic":"...","angle":"...","urgency":"high|medium|low"}]} — 5 trend.`,

  keywords: `Sen bir SEO uzmanısın. Verilen haber başlığı ve içeriği için arama motoru optimizasyonuna uygun anahtar kelimeler oluştur.
JSON: {"keywords":["kelime1","kelime2",...]} — 8 ile 15 arasında anahtar kelime, Türkçe, küçük harf, tekil veya 2-3 kelimelik ifadeler olabilir.
Kişi adları, yer adları, konu başlıkları ve arama niyetiyle eşleşen terimleri dahil et.`,
}

function parseAiJson(raw: string): Record<string, unknown> {
  let jsonStr = raw.trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonStr = fence[1]!.trim()
  if (!jsonStr.startsWith('{')) {
    const obj = jsonStr.match(/\{[\s\S]*\}/)
    if (obj) jsonStr = obj[0]
  }
  return JSON.parse(jsonStr) as Record<string, unknown>
}

async function callDeepSeekOnce(
  systemPrompt: string,
  userMessage: string,
  opts: { timeoutMs: number; maxTokens: number; attempt?: number }
): Promise<Record<string, unknown>> {
  const { deepseekChatCompletion } = await import('@/lib/ai/deepseekClient')
  const raw = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
    deepseekChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.45,
    maxTokens: opts.maxTokens,
    timeoutMs: opts.timeoutMs,
    disableThinking: true,
    jsonMode: true,
    telemetry: {
      agentName: 'ai_assist',
      operation: 'cms_assist',
      promptVersion: 'ai-assist:v1',
      attempt: opts.attempt ?? 1,
    },
  })
  )
  try {
    return parseAiJson(raw)
  } catch {
    throw new Error(`DeepSeek JSON parse hatası (${raw.length} karakter)`)
  }
}

async function callGeminiFallback(
  systemPrompt: string,
  userMessage: string
): Promise<Record<string, unknown>> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (!geminiKey) throw new Error('GEMINI_API_KEY yok')

  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 8000,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(55_000),
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const raw = parts.find((p) => !p.thought && typeof p.text === 'string')?.text?.trim()
  if (!raw) throw new Error('Gemini: boş yanıt')
  return parseAiJson(raw)
}

async function callAi(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
  const errors: string[] = []
  const { isGeminiFallbackEnabled, isGeminiCreditError } = await import('@/lib/ai/deepseekClient')

  // DeepSeek primary — V4 thinking kapalı + boş yanıtta retry
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      return await callDeepSeekOnce(systemPrompt, userMessage, {
        timeoutMs: 85_000,
        maxTokens: 6000,
        attempt: 1,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`DeepSeek: ${msg}`)
      const shouldRetry = /timeout|aborted|AbortError|boş yanıt|0 karakter|HTTP 429|HTTP 5\d\d/i.test(
        msg
      )
      if (shouldRetry) {
        try {
          console.warn('[ai-assist] DeepSeek retry')
          return await callDeepSeekOnce(systemPrompt, userMessage, {
            timeoutMs: 70_000,
            maxTokens: 4000,
            attempt: 2,
          })
        } catch (e2) {
          errors.push(`DeepSeek retry: ${e2 instanceof Error ? e2.message : String(e2)}`)
        }
      }
    }
  }

  // Gemini yalnızca açıkça etkinse (kredi yokken varsayılan kapalı)
  if (isGeminiFallbackEnabled() && process.env.GEMINI_API_KEY?.trim()) {
    try {
      console.warn('[ai-assist] Gemini fallback')
      return await callGeminiFallback(systemPrompt, userMessage)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isGeminiCreditError(msg)) {
        errors.push('Gemini: kredi yok (GEMINI_FALLBACK kapatıldı / billing)')
      } else {
        errors.push(`Gemini: ${msg}`)
      }
    }
  }

  throw new Error(
    errors.length
      ? errors.join(' | ')
      : 'AI anahtarı yapılandırılmamış (DEEPSEEK_API_KEY)'
  )
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    mode: AssistMode
    input?: string
    imageUrl?: string
    imageUrls?: string[]
    aiEditorId?: string
    articleFormat?: ArticleFormatAssist
    autoRoute?: boolean
    categoryId?: string
    citySlug?: string
    districtSlug?: string
    isBreaking?: boolean
  }
  try {
    body = await request.json() as {
      mode: AssistMode
      input?: string
      imageUrl?: string
      imageUrls?: string[]
      aiEditorId?: string
      articleFormat?: ArticleFormatAssist
      autoRoute?: boolean
      categoryId?: string
      citySlug?: string
      districtSlug?: string
      isBreaking?: boolean
    }
  }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { mode, input = '', imageUrl } = body
  if (!mode || !SYSTEM_PROMPTS[mode]) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })

  const userMessage = mode === 'trends' ? 'Türkiye gündemini analiz et.' : input.trim() || 'Haber içeriği sağlanmadı.'
  const selectedAiEditorId = body.aiEditorId?.trim() || ''
  const autoRoute = body.autoRoute === true || selectedAiEditorId === '__auto__'
  const articleFormat: ArticleFormatAssist =
    body.articleFormat === 'column' || body.articleFormat === 'analysis'
      ? body.articleFormat
      : 'standard'

  try {
    let personaMeta: {
      aiEditorId: string
      editorName: string
      editorSlug: string
      promptVersions: Record<string, number>
      routeConfidence?: number
      routeReason?: string
      secondaryEditorSlug?: string | null
      suggestedCategoryId?: string | null
      suggestedCitySlug?: string | null
      suggestedDistrictSlug?: string | null
      suggestedCountrySlug?: string | null
    } | null = null
    let systemPrompt = SYSTEM_PROMPTS[mode]

    if (
      (selectedAiEditorId || autoRoute) &&
      (mode === 'publish-ready' || mode === 'create' || mode === 'rewrite')
    ) {
      let editor = selectedAiEditorId && !autoRoute
        ? await getAiEditorById(selectedAiEditorId)
        : null

      let routeMeta: Awaited<ReturnType<typeof routeEditorial>> | null = null
      if (autoRoute || !editor) {
        routeMeta = await routeEditorial({
          preferredAiEditorId: autoRoute ? null : selectedAiEditorId || null,
          categoryId: body.categoryId || null,
          citySlug: body.citySlug || null,
          districtSlug: body.districtSlug || null,
          isBreaking: body.isBreaking === true,
          articleFormat,
          text: input,
        })
        editor = routeMeta.editor
      }

      if (!editor || editor.status === 'archived') {
        return NextResponse.json({ error: 'Geçersiz veya arşivlenmiş AI editör' }, { status: 400 })
      }
      const task: AiPromptType =
        articleFormat === 'column'
          ? 'column'
          : articleFormat === 'analysis'
            ? 'analysis'
            : 'news'
      const provinceName = routeMeta?.citySlug
        ? TURKISH_PROVINCES.find((p) => p.slug === routeMeta.citySlug)?.name
        : undefined
      const built = await buildEditorPrompt({
        editor,
        task,
        sourceTitle: input.split('\n').find((line) => line.trim())?.slice(0, 200),
        sourceBody: input,
        categoryId: routeMeta?.categoryId || body.categoryId || undefined,
        province: provinceName,
        district: routeMeta?.districtSlug || body.districtSlug || undefined,
        extraUserNotes:
          mode === 'publish-ready'
            ? 'CMS formundan tek tuşla yayıma hazır, net ve olgusal haber üret.'
            : undefined,
      })
      systemPrompt = [
        built.system,
        PERSONA_ATTENTION_LOCK,
        PUBLISH_JSON_SCHEMA,
      ].join('\n\n')
      personaMeta = {
        aiEditorId: editor.id,
        editorName: editor.name,
        editorSlug: editor.slug,
        promptVersions: built.promptVersions as Record<string, number>,
        routeConfidence: routeMeta?.confidence,
        routeReason: routeMeta?.reason,
        secondaryEditorSlug: routeMeta?.secondaryEditorSlug ?? null,
        suggestedCategoryId: routeMeta?.categoryId ?? null,
        suggestedCitySlug: routeMeta?.citySlug ?? null,
        suggestedDistrictSlug: routeMeta?.districtSlug ?? null,
        suggestedCountrySlug: routeMeta?.countrySlug ?? null,
      }
    }

    const requestedUrls = [
      ...(imageUrl?.trim() ? [imageUrl.trim()] : []),
      ...(Array.isArray(body.imageUrls) ? body.imageUrls : []),
    ]
      .map((url) => url.trim())
      .filter((url, index, all) => url && all.indexOf(url) === index)
      .slice(0, 6)

    const researchPromise =
      mode === 'publish-ready'
        ? researchLiveNews({ query: input.slice(0, 500), context: input })
        : Promise.resolve(null)
    const imagePromise =
      mode === 'publish-ready' && requestedUrls.length > 0
        ? Promise.all(
            requestedUrls.map(async (url) => {
              const analysis = await generateImageAnalysis({
                imageUrl: url,
                title: '',
                content: input.slice(0, 2500),
              })
              return analysis ? { url, ...analysis } : null
            })
          )
        : Promise.resolve([])
    const [research, settledImages] = await Promise.all([researchPromise, imagePromise])
    const imageAnalyses: Array<ImageAnalysis & { url: string }> = settledImages.filter(
      (item): item is ImageAnalysis & { url: string } => item !== null
    )

    const enrichedUserMessage =
      mode === 'publish-ready'
        ? [
            personaMeta
              ? `YAZAR KİMLİĞİ: ${personaMeta.editorName} (@${personaMeta.editorSlug}) — yukarıdaki karakter/tarz talimatlarına uy.`
              : '',
            'HAM HABER METNİ:',
            userMessage.slice(0, 18_000),
            '',
            'CANLI GOOGLE ARAŞTIRMA NOTLARI:',
            research
              ? [
                  research.brief,
                  '',
                  'DOĞRULANABİLİR KAYNAKLAR:',
                  ...research.sources.map(
                    (source, index) => `[${index + 1}] ${source.title}: ${source.url}`
                  ),
                ].join('\n')
              : 'Canlı araştırma yapılamadı. Ham metnin dışına çıkma.',
            '',
            'GÖRSEL ANALİZLERİ (YALNIZCA imageOrder sıralaması için — caption/alt metni haber gövdesine YAZMA):',
            imageAnalyses.length > 0
              ? imageAnalyses.map((img, i) =>
                  `[Görsel ${i + 1}] url:${img.url} | role:${img.role} | alaka:${img.relevanceScore}/100 | caption(sadece imageOrder için):"${img.caption}"`
                ).join('\n')
              : 'Görsel yok veya analiz edilemedi.',
          ]
            .filter(Boolean)
            .join('\n')
        : userMessage
    const parsed = await callAi(systemPrompt, enrichedUserMessage)

    if (mode === 'create' || mode === 'rewrite' || mode === 'publish-ready') {
      const title = stripAiHtmlLeak(String(parsed.title ?? ''))
      const content = stripAiHtmlLeak(String(parsed.content ?? ''))
      const spot = stripAiHtmlLeak(String(parsed.spot ?? ''))
      const summary = stripAiHtmlLeak(String(parsed.summary ?? ''))
      const requestedOrder = Array.isArray(parsed.imageOrder)
        ? parsed.imageOrder.map(String).filter((url) => requestedUrls.includes(url))
        : []
      const orderedUrls = [
        ...requestedOrder,
        ...requestedUrls.filter((url) => !requestedOrder.includes(url)),
      ]
      const orderedImages = orderedUrls.map((url) => {
        const analysis = imageAnalyses.find((item) => item.url === url)
        return {
          url,
          caption: analysis?.caption,
          alt: analysis?.alt,
          credit: analysis?.creditHint ?? undefined,
        }
      })
      const bodyBlocks = buildBodyBlocksFromAi({
        title: title || 'Haber',
        spot,
        summary,
        content,
        imageUrl: orderedImages[0]?.url || imageUrl?.trim(),
        imageCaption: orderedImages[0]?.caption || title || undefined,
        additionalImages: orderedImages.slice(1),
      })
      const categoryCandidate = String(parsed.categoryId ?? '').trim()
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map(String).map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : []
      const routedCategory =
        personaMeta?.suggestedCategoryId &&
        CATEGORY_IDS.has(personaMeta.suggestedCategoryId)
          ? personaMeta.suggestedCategoryId
          : null
      const categoryId = applyAstrologyCategoryOverride(
        CATEGORY_IDS.has(categoryCandidate)
          ? categoryCandidate
          : routedCategory || 'gundem',
        title,
        content,
        tags
      )
      let seoKeywords = Array.isArray(parsed.seoKeywords)
        ? parsed.seoKeywords.map(String).map((word) => word.trim().toLowerCase()).filter(Boolean).slice(0, 15)
        : []
      if (seoKeywords.length === 0) {
        seoKeywords = deriveSeoKeywords(title, tags, spot)
      }
      const textComplete =
        !contentHasIncompleteSegments(content) &&
        !titleLooksIncomplete(title) &&
        !contentHasIncompleteSegments(spot)
      const researchOk =
        !research || (research.sources.length >= 2 && research.brief.length >= 120)
      const checks = [
        title.length >= 20,
        spot.length >= 80,
        summary.length >= 60,
        content.length >= 400,
        CATEGORY_IDS.has(categoryCandidate) || categoryId === 'astroloji',
        tags.length >= 3,
        String(parsed.seoTitle ?? '').trim().length >= 40,
        String(parsed.seoDescription ?? '').trim().length >= 120,
        researchOk,
        textComplete,
      ]
      let qualityScore = Math.round((checks.filter(Boolean).length / checks.length) * 100)
      // Yarım cümle / kesik başlık varsa puanı sert düşür (screenshot'taki %90 yanılgısını önle)
      if (!textComplete) qualityScore = Math.min(qualityScore, 45)
      const gateDecision =
        qualityScore >= 78 && textComplete && researchOk
          ? 'publish'
          : 'review'
      const countryFromText =
        categoryId === 'dunya' || isKibrisCategoryTree(categoryId)
          ? resolveCountryFromText(`${title}\n${spot}\n${content}\n${tags.join(' ')}`)
          : null
      return NextResponse.json({
        success: true,
        mode,
        title,
        spot,
        summary,
        content: articleBlocksToPlainText(bodyBlocks) || content,
        bodyBlocks,
        seoTitle: clampAtWordBoundary(String(parsed.seoTitle ?? title).trim(), 65),
        seoDescription: clampAtSentenceBoundary(String(parsed.seoDescription ?? summary).trim(), 165),
        categoryId,
        tags,
        seoKeywords,
        imageOrder: orderedUrls,
        imageAnalyses,
        imageCaption: orderedImages[0]?.caption ?? '',
        additionalImages: orderedImages.slice(1),
        qualityScore,
        gateDecision,
        researchSources: research?.sources ?? [],
        researchQueries: research?.searchQueries ?? [],
        liveResearchUsed: Boolean(research),
        aiEditorId: personaMeta?.aiEditorId ?? null,
        editorName: personaMeta?.editorName ?? null,
        editorSlug: personaMeta?.editorSlug ?? null,
        routeConfidence: personaMeta?.routeConfidence ?? null,
        routeReason: personaMeta?.routeReason ?? null,
        secondaryEditorSlug: personaMeta?.secondaryEditorSlug ?? null,
        suggestedCitySlug:
          categoryId === 'dunya' ? null : personaMeta?.suggestedCitySlug ?? null,
        suggestedDistrictSlug:
          categoryId === 'dunya' ? null : personaMeta?.suggestedDistrictSlug ?? null,
        suggestedCountrySlug:
          personaMeta?.suggestedCountrySlug ?? countryFromText?.slug ?? null,
        articleFormat,
        promptVersions: personaMeta?.promptVersions ?? null,
      })
    }

    if (mode === 'keywords') {
      const titleLine = input.split('\n').find((line) => line.trim())?.trim() ?? ''
      let keywords = extractSeoKeywordsFromAiPayload(parsed)
      if (keywords.length === 0) {
        keywords = deriveSeoKeywords(titleLine, [], input.slice(0, 500))
      }
      return NextResponse.json({ success: true, mode, keywords })
    }

    return NextResponse.json({ success: true, mode, ...parsed })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[ai-assist]', msg)
    return NextResponse.json({ error: `AI isteği başarısız: ${msg}` }, { status: 500 })
  }
}
