import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { generateImageAnalysis, type ImageAnalysis } from '@/lib/ai/imageSeo'
import { researchLiveNews } from '@/lib/ai/liveResearch'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

type AssistMode =
  | 'create'
  | 'rewrite'
  | 'publish-ready'
  | 'seo'
  | 'tags'
  | 'headline'
  | 'trends'
  | 'keywords'

const CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((category) => category.id))
const CATEGORY_LIST = DEFAULT_CATEGORIES.map((category) => `${category.id}: ${category.name}`).join(', ')

const SYSTEM_PROMPTS: Record<AssistMode, string> = {
  create: `Sen deneyimli bir Türk gazetecisisin. Verilen konuda profesyonel bir haber metni yaz.
JSON formatında yanıt ver: {"title":"...","content":"...","summary":"...","spot":"..."}
spot: 5W+1H (Kim,Ne,Nerede,Ne Zaman,Neden,Nasıl) yanıtlayan 2-4 cümlelik haber girizgahı; spot yalnızca bu alanda, content içinde TEKRAR etme.
content kuralları:
- ## H2 ve ### H3 kullan; # H1 KULLANMA
- Her başlık kendi satırında olsun, en fazla 6 kelime; manşet cümlesi veya spot metnini başlık yapma
- Başlıktan sonra boş satır bırak, sonra tam paragraf
- Başlık ile paragrafı aynı satıra veya bitişik yapıştırma
- content içinde kapak görseli veya spot/giriş paragrafı tekrarı yazma; gövde doğrudan ilk ## bölümüyle başlasın
- Paragrafları yarım bırakma; cümleleri tamamla`,

  rewrite: `Sen deneyimli bir Türk gazete editörüsün. Verilen haberi yeniden yaz, daha akıcı ve profesyonel yap.
JSON: {"title":"...","content":"...","summary":"...","spot":"..."}
content kuralları: ## / ### başlıklar kendi satırında (max 6 kelime), ardından boş satır + tam paragraf; # H1 yok; spot ve giriş paragrafını content'e kopyalama; metinleri kesme.`,

  'publish-ready': `Sen NaHaber'in deneyimli genel yayın yönetmenisin. Kullanıcının verdiği ham metni, hiçbir olgu uydurmadan, yayıma hazır profesyonel bir Türkçe habere dönüştür.
Kurallar:
- Ana başlık güçlü, doğru ve clickbait olmayan bir manşet olsun.
- spot 5W+1H'yi karşılayan 2-4 cümle olsun; spot yalnızca spot alanında, content içinde tekrar etmesin.
- summary en fazla 280 karakter olsun.
- content özgün, akıcı ve ayrıntılı olsun; kapak görseli veya manşet açıklamasını content'e ekleme.
- content markdown yapısı ZORUNLU:
  * ## H2 ve gerektiğinde ### H3 kullan; # H1 ASLA kullanma
  * Her başlık haber konusunu özetleyen bağımsız bir etiket olsun; ZORUNLU: en fazla 6 kelime
  * Görsel açıklaması (caption/alt), kişi-yer adı listesi veya uzun cümle başlık OLAMAZ
  * Başlıktan sonra bir boş satır, sonra tam ve eksiksiz paragraf
  * "### BaşlıkParagraf" gibi bitişik yazım YASAK
  * ZORUNLU: Her cümle ve paragraf tam ve eksiksiz bitsin; yarım cümle veya kesilmiş kelime bırakma
  * Aynı paragrafı veya spot cümlesini content içinde iki kez yazma
  * İlk satır doğrudan ## ile başlayan ilk bölüm olsun (giriş/spot paragrafı content'te olmasın)
- Ham metinde bulunmayan kişi, sayı, tarih, yer, alıntı veya iddia ekleme.
- CANLI ARAŞTIRMA NOTLARI varsa yalnızca bu notlarda açıkça kaynaklandırılmış olguları kullan.
- Çelişkili veya tek kaynağa dayanan iddiaları kesin bilgi gibi sunma.
- Araştırma notundaki ham URL'leri haber gövdesine yapıştırma; gerektiğinde kaynağı kurum adıyla belirt.
- GÖRSEL YASAĞI: Görsel analizindeki caption veya alt metni haber gövdesinde H2/H3 başlık, paragraf veya alıntı olarak ASLA yazma; bu veriler yalnızca imageOrder sıralaması içindir.
- seoTitle 50-65, seoDescription 140-165 karakter olsun.
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

async function callAi(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
  const errors: string[] = []

  // --- DeepSeek (primary) ---
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    try {
      const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          response_format: { type: 'json_object' },
          temperature: 0.45,
          max_tokens: 8000,
        }),
        signal: AbortSignal.timeout(35_000),
      })
      if (res.ok) {
        const json = await res.json() as { choices: Array<{ message: { content: string } }> }
        const content = json.choices[0]?.message?.content?.trim() ?? '{}'
        try {
          return JSON.parse(content) as Record<string, unknown>
        } catch {
          errors.push(`DeepSeek JSON parse hatası (${content.length} karakter)`)
        }
      } else {
        const body = await res.text().catch(() => '')
        errors.push(`DeepSeek HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
    } catch (e) {
      errors.push(`DeepSeek bağlantı hatası: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // --- Gemini (fallback) ---
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (geminiKey) {
    try {
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
          signal: AbortSignal.timeout(50_000),
        }
      )
      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
        }
        const parts = data.candidates?.[0]?.content?.parts ?? []
        const raw = parts.find(p => !p.thought && typeof p.text === 'string')?.text?.trim()
        if (raw) {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          try {
            return JSON.parse(cleaned) as Record<string, unknown>
          } catch {
            errors.push(`Gemini JSON parse hatası`)
          }
        } else {
          errors.push('Gemini: boş yanıt')
        }
      } else {
        const body = await res.text().catch(() => '')
        errors.push(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
    } catch (e) {
      errors.push(`Gemini bağlantı hatası: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(errors.length ? errors.join(' | ') : 'AI anahtarı yapılandırılmamış')
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { mode: AssistMode; input?: string; imageUrl?: string; imageUrls?: string[] }
  try {
    body = await request.json() as {
      mode: AssistMode
      input?: string
      imageUrl?: string
      imageUrls?: string[]
    }
  }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { mode, input = '', imageUrl } = body
  if (!mode || !SYSTEM_PROMPTS[mode]) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })

  const userMessage = mode === 'trends' ? 'Türkiye gündemini analiz et.' : input.trim() || 'Haber içeriği sağlanmadı.'

  try {
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
          ].join('\n')
        : userMessage
    const parsed = await callAi(SYSTEM_PROMPTS[mode], enrichedUserMessage)

    if (mode === 'create' || mode === 'rewrite' || mode === 'publish-ready') {
      const title = String(parsed.title ?? '').trim()
      const content = String(parsed.content ?? '').trim()
      const spot = String(parsed.spot ?? '').trim()
      const summary = String(parsed.summary ?? '').trim()
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
      const categoryId = applyAstrologyCategoryOverride(
        CATEGORY_IDS.has(categoryCandidate) ? categoryCandidate : 'gundem',
        title,
        content,
        tags
      )
      const seoKeywords = Array.isArray(parsed.seoKeywords)
        ? parsed.seoKeywords.map(String).map((word) => word.trim().toLowerCase()).filter(Boolean).slice(0, 15)
        : []
      const checks = [
        title.length >= 20,
        spot.length >= 80,
        summary.length >= 60,
        content.length >= 600,
        /^##\s+\S/m.test(content),
        CATEGORY_IDS.has(categoryCandidate) || categoryId === 'astroloji',
        tags.length >= 5,
        String(parsed.seoTitle ?? '').trim().length >= 40,
        String(parsed.seoDescription ?? '').trim().length >= 120,
        (research?.sources.length ?? 0) >= 2,
      ]
      const qualityScore = Math.round((checks.filter(Boolean).length / checks.length) * 100)
      const gateDecision =
        qualityScore >= 78 && (research?.sources.length ?? 0) >= 2
          ? 'publish'
          : 'review'
      return NextResponse.json({
        success: true,
        mode,
        title,
        spot,
        summary,
        content: articleBlocksToPlainText(bodyBlocks) || content,
        bodyBlocks,
        seoTitle: String(parsed.seoTitle ?? title).trim(),
        seoDescription: String(parsed.seoDescription ?? summary).trim(),
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
      })
    }

    return NextResponse.json({ success: true, mode, ...parsed })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[ai-assist]', msg)
    return NextResponse.json({ error: `AI isteği başarısız: ${msg}` }, { status: 500 })
  }
}
