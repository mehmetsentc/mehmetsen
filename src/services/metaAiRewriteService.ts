/**
 * Meta / Llama rewrite — tüm sosyal paylaşımlar için AI editör.
 *
 * Platformlar: Facebook photos, Instagram feed, Threads, X/Twitter, Stories (özet).
 * POST https://api.llama.com/v1/chat/completions
 * Model: Llama-3.3-70B-Instruct
 * Auth: Bearer LLAMA_API_KEY (env) or config/socialMedia.llamaApiKey
 *
 * Cache: Firestore aiRewriteCache/{hash} — 24h TTL (articleUrl paylaşılır → platformlar cache hit)
 * Logs:  Firestore ai_rewrite_logs
 * Toggle: config/socialAutoShare.metaAiRewrite (varsayılan açık)
 */
import { createHash } from 'crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAutoShareSettings } from '@/lib/social/autoShareSettingsStore'
import { clampCompleteSentences } from '@/lib/social/feedCaption'

const LLAMA_URL = 'https://api.llama.com/v1/chat/completions'
const LLAMA_MODEL = 'Llama-3.3-70B-Instruct'
const TIMEOUT_MS = 6_000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ALLOWED_TAGS = new Set(['#çanakkale', '#sondakika'])

/** Platform-specific caption body max (URL/hashtag publisher ekler). */
export type SocialAiPlatform = 'facebook' | 'instagram' | 'threads' | 'twitter' | 'story'

export const PLATFORM_CAPTION_MAX: Record<SocialAiPlatform, number> = {
  facebook: 220,
  instagram: 600,
  threads: 280,
  twitter: 200,
  /** Story OG özeti ile hizalı; softMax ile tam cümleye yer bırakılır */
  story: 200,
}

const SYSTEM_PROMPT = `Sen NaHaber ve Onyedi Tivi için Türkçe sosyal medya AI editörüsün.
Facebook, Instagram, Threads, X ve Hikâye paylaşımları için özgün caption / özet üretiyorsun.

AMAÇ: Organik erişim. Başlık manşetini AYNEN kullanma; aynı kelime torbasını yeniden dizme.

KURALLAR:
1) caption: Haberi 1–2 özgün cümlede özetle. Başlıktaki kelime dizilimini kopyalama.
2) Ton: Ciddi yerel haber odası. Clickbait yasak ("şok", "inanılmaz", "son dakika bomba", sahte vaat).
3) Uzunluk: caption toplam max 220 karakter; en fazla 2 cümle; emoji en fazla 1 (tercihen yok — 📍 şehir satırını sistem ekler).
4) URL / https / www / "tıkla" / "haberimizde" / "devamını oku" caption içinde YASAK.
5) hashtags: max 2; yalnızca #Çanakkale ve/veya #SonDakika. Konuya uymuyorsa boş dizi []. Başka etiket YASAK.
6) comment_text: Kısa yönlendirme, link YOK (sistem haber URL’sini ekler). Örn: "Haberin detayı:" veya "Ayrıntılar:"
7) Şehir bağlamını doğal kullan ama "📍 Şehir" satırını caption’a yazma — sistem ekler.
8) Çıktı YALNIZCA geçerli JSON, başka metin yok:
{"caption":"...","hashtags":["#Çanakkale","#SonDakika"],"comment_text":"Haberin detayı:"}`

export interface MetaAiRewriteResult {
  caption: string
  hashtags: string[]
  comment_text: string
  source: 'llama' | 'cache' | 'fallback'
  cacheKey?: string
  error?: string
}

let lastCallAt = 0
const MIN_INTERVAL_MS = 800

async function resolveLlamaApiKey(): Promise<string> {
  const env = process.env.LLAMA_API_KEY?.trim() || ''
  if (env) return env
  try {
    const snap = await getAdminFirestore().collection('config').doc('socialMedia').get()
    const k = (snap.data()?.llamaApiKey as string | undefined)?.trim()
    return k || ''
  } catch {
    return ''
  }
}

/** Global toggle — varsayılan açık. */
export async function isMetaAiRewriteEnabled(): Promise<boolean> {
  try {
    const settings = await getAutoShareSettings()
    return settings.metaAiRewrite !== false
  } catch {
    return true
  }
}

export function hashRewriteKey(title: string, content: string, articleUrl?: string): string {
  const raw = (articleUrl?.trim() || `${title.trim()}|${content.trim().slice(0, 800)}`).toLowerCase()
  return createHash('sha256').update(raw).digest('hex').slice(0, 40)
}

function stripUrls(s: string): string {
  return s
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function enforceHashtags(tags: unknown): string[] {
  const out: string[] = []
  if (!Array.isArray(tags)) return out
  for (const raw of tags) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const withHash = t.startsWith('#') ? t : `#${t}`
    const key = withHash.toLocaleLowerCase('tr-TR')
    if (!ALLOWED_TAGS.has(key)) continue
    const canonical = key === '#çanakkale' ? '#Çanakkale' : '#SonDakika'
    if (!out.includes(canonical)) out.push(canonical)
    if (out.length >= 2) break
  }
  return out
}

function clampCaption(caption: string, max = 220): string {
  const t = stripUrls(caption).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const sp = slice.lastIndexOf(' ')
  return (sp > 80 ? slice.slice(0, sp) : slice).trim()
}

function fallbackRewrite(title: string, content: string, city: string): MetaAiRewriteResult {
  const base = stripUrls(content || title).replace(/\s+/g, ' ').trim()
  let caption = base
  const titleNorm = title.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
  if (!caption || caption.toLocaleLowerCase('tr-TR') === titleNorm || caption.toLocaleLowerCase('tr-TR').startsWith(titleNorm)) {
    const words = title.split(/\s+/).filter(Boolean)
    const rotated = words.length >= 4 ? [...words.slice(2), ...words.slice(0, 2)].join(' ') : title
    caption = `${rotated.slice(0, 90)}. ${city} gündeminde gelişmeler sürüyor.`
  }
  // Keep ~2 sentences
  const parts = caption.split(/(?<=[.!?…])\s+/).filter(Boolean).slice(0, 2)
  caption = clampCaption(parts.join(' '))
  return {
    caption,
    hashtags: ['#Çanakkale', '#SonDakika'],
    comment_text: 'Haberin detayı:',
    source: 'fallback',
    error: 'AI timeout',
  }
}

function parseLlamaJson(raw: string): { caption?: string; hashtags?: string[]; comment_text?: string } | null {
  const text = raw.trim()
  try {
    return JSON.parse(text) as { caption?: string; hashtags?: string[]; comment_text?: string }
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as { caption?: string; hashtags?: string[]; comment_text?: string }
    } catch {
      return null
    }
  }
}

async function readCache(cacheKey: string): Promise<MetaAiRewriteResult | null> {
  try {
    const snap = await getAdminFirestore().collection('aiRewriteCache').doc(cacheKey).get()
    if (!snap.exists) return null
    const d = snap.data() as {
      caption?: string
      hashtags?: string[]
      comment_text?: string
      createdAt?: number
    }
    const createdAt = typeof d.createdAt === 'number' ? d.createdAt : 0
    if (!createdAt || Date.now() - createdAt > CACHE_TTL_MS) return null
    if (!d.caption?.trim()) return null
    return {
      caption: clampCaption(d.caption),
      hashtags: enforceHashtags(d.hashtags),
      comment_text: stripUrls(d.comment_text || 'Haberin detayı:'),
      source: 'cache',
      cacheKey,
    }
  } catch {
    return null
  }
}

async function writeCache(cacheKey: string, result: MetaAiRewriteResult, meta: {
  title: string
  city: string
  articleUrl?: string
}): Promise<void> {
  try {
    await getAdminFirestore().collection('aiRewriteCache').doc(cacheKey).set({
      caption: result.caption,
      hashtags: result.hashtags,
      comment_text: result.comment_text,
      title: meta.title.slice(0, 200),
      city: meta.city,
      articleUrl: meta.articleUrl ?? null,
      createdAt: Date.now(),
      source: result.source,
    })
  } catch (err) {
    console.warn('[metaAiRewrite] cache write failed:', err)
  }
}

/** Audit log after (or before) social publish. */
export async function logAiRewrite(entry: {
  newsId?: string
  title: string
  articleUrl?: string
  ai_caption: string
  hashtags: string[]
  comment_text: string
  post_id?: string
  source: string
  error?: string
  cacheKey?: string
  platform?: SocialAiPlatform
}): Promise<void> {
  try {
    await getAdminFirestore().collection('ai_rewrite_logs').add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    })
  } catch (err) {
    console.warn('[metaAiRewrite] log failed:', err)
  }
}

/**
 * Rewrite news for social caption + comment opener.
 * Timeout 6s → fallback. Same hash within 24h → cache hit (tüm platformlar paylaşır).
 */
export async function rewriteForSocial(
  title: string,
  content: string,
  city = 'Çanakkale',
  opts?: { articleUrl?: string; newsId?: string; skipCache?: boolean },
): Promise<MetaAiRewriteResult> {
  const cacheKey = hashRewriteKey(title, content, opts?.articleUrl)

  if (!opts?.skipCache) {
    const cached = await readCache(cacheKey)
    if (cached) {
      console.log(`[metaAiRewrite] cache hit key=${cacheKey}`)
      return cached
    }
  }

  const apiKey = await resolveLlamaApiKey()
  if (!apiKey) {
    console.error('[metaAiRewrite] LLAMA_API_KEY eksik — fallback')
    const fb = fallbackRewrite(title, content, city)
    fb.error = 'LLAMA_API_KEY eksik'
    return { ...fb, cacheKey }
  }

  // Light client-side spacing
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt = Date.now()

  const userPrompt = `ŞEHİR: ${city}
BAŞLIK: ${title}
İÇERİK: ${content.slice(0, 1800)}

JSON üret.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(LLAMA_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'NaHaber/1.0 (+https://www.nahaber.com)',
      },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        temperature: 0.4,
        max_completion_tokens: 280,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (!res.ok) {
      console.error('[metaAiRewrite] API error:', json.error ?? res.status)
      const fb = fallbackRewrite(title, content, city)
      fb.error = json.error?.message ?? `HTTP ${res.status}`
      return { ...fb, cacheKey }
    }

    const raw = json.choices?.[0]?.message?.content ?? ''
    const parsed = parseLlamaJson(raw)
    if (!parsed?.caption?.trim()) {
      console.error('[metaAiRewrite] bad JSON — fallback')
      const fb = fallbackRewrite(title, content, city)
      fb.error = 'bad JSON'
      return { ...fb, cacheKey }
    }

    const result: MetaAiRewriteResult = {
      caption: clampCaption(parsed.caption),
      hashtags: enforceHashtags(parsed.hashtags),
      comment_text: stripUrls(parsed.comment_text || 'Haberin detayı:'),
      source: 'llama',
      cacheKey,
    }

    await writeCache(cacheKey, result, { title, city, articleUrl: opts?.articleUrl })
    console.log(`[metaAiRewrite] llama ok key=${cacheKey} len=${result.caption.length}`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = /abort|timeout/i.test(msg)
    console.error(`[metaAiRewrite] ${isTimeout ? 'AI timeout' : 'error'}:`, msg)
    const fb = fallbackRewrite(title, content, city)
    fb.error = isTimeout ? 'AI timeout' : msg
    return { ...fb, cacheKey }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Platform-aware rewrite: toggle kapalıysa null; açıkken rewrite + platform max clamp.
 * AI fail → fallback caption (yine döner); asla throw etmez.
 */
export async function rewriteForPlatform(
  title: string,
  content: string,
  city: string,
  platform: SocialAiPlatform,
  opts?: { articleUrl?: string; newsId?: string },
): Promise<(MetaAiRewriteResult & { enabled: true }) | { enabled: false }> {
  const enabled = await isMetaAiRewriteEnabled()
  if (!enabled) return { enabled: false }

  const ai = await rewriteForSocial(title, content, city, opts)
  const max = PLATFORM_CAPTION_MAX[platform]
  let caption = ai.caption
  if (platform === 'story') {
    // clampCaption kelime ortasında bırakabilir; hikâyede yalnızca tam cümle.
    // softMax: 2. cümle biraz taşarsa tamamını koru (yarım "can" engeli).
    caption = clampCompleteSentences(caption, max, max + 32)
  } else if (caption.length > max) {
    caption = clampCaption(caption, max)
  }

  if (ai.source === 'fallback' || ai.error) {
    console.error(`[metaAiRewrite] ${platform} fallback news=${opts?.newsId ?? '?'}: ${ai.error ?? 'AI timeout'}`)
  } else {
    console.log(`[metaAiRewrite] ${platform} ok source=${ai.source} len=${caption.length}`)
  }

  return { ...ai, caption, enabled: true }
}
