/**
 * Meta / Llama rewrite — tüm sosyal paylaşımlar için AI editör.
 *
 * Platformlar: Facebook photos, Instagram feed, Threads, X/Twitter, Stories (özet).
 * POST https://api.llama.com/v1/chat/completions
 * Model: Llama-3.3-70B-Instruct
 * Auth: Bearer LLAMA_API_KEY (env) or config/socialMedia.llamaApiKey
 *
 * Cache: Firestore aiRewriteCache/{hash} — 24h TTL
 *   Hash platform-scoped (story cache Instagram caption'ı zehirlemesin).
 * Logs:  Firestore ai_rewrite_logs
 * Toggle: config/socialAutoShare.metaAiRewrite (varsayılan açık)
 *
 * Manşet/OG overlay Meta AI üretmez — DeepSeek/Gemini socialHeadline + /api/og/social.
 * Meta AI yalnızca caption / story özeti üretir.
 */
import { createHash } from 'crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getAutoShareSettings } from '@/lib/social/autoShareSettingsStore'
import {
  clampCompleteSentences,
  isIncompleteCaption,
  isThinSocialCaption,
} from '@/lib/social/feedCaption'
import { repairSocialCopyAgainstSource } from '@/lib/social/socialFactualFidelity'

const LLAMA_URL = 'https://api.llama.com/v1/chat/completions'
const LLAMA_MODEL = 'Llama-3.3-70B-Instruct'
const TIMEOUT_MS = 6_000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ALLOWED_TAGS = new Set(['#çanakkale', '#sondakika'])

/** Platform-specific caption body max (URL/hashtag publisher ekler). */
export type SocialAiPlatform = 'facebook' | 'instagram' | 'threads' | 'twitter' | 'story'

export const PLATFORM_CAPTION_MAX: Record<SocialAiPlatform, number> = {
  facebook: 320,
  /** DeepSeek kalitesine yakın: 2–3 kısa paragraf */
  instagram: 700,
  threads: 280,
  twitter: 200,
  /** Story OG özeti ile hizalı; softMax ile tam cümleye yer bırakılır */
  story: 200,
}

const PLATFORM_MIN_CHARS: Record<SocialAiPlatform, number> = {
  facebook: 80,
  instagram: 140,
  threads: 60,
  twitter: 50,
  story: 60,
}

function buildSystemPrompt(platform: SocialAiPlatform, max: number): string {
  const igExtra =
    platform === 'instagram'
      ? `INSTAGRAM: caption 2–3 kısa paragraf olsun (\\n\\n). İlk paragraf emoji ile başlayabilir. Toplam ${Math.min(max, 700)} karaktere kadar; ince 1 cümlelik teaser YASAK — okuyucu ne olduğunu anlamalı.`
      : platform === 'story'
        ? `HİKÂYE ÖZETİ: 1–2 tam cümle, max ${max} karakter; manşet altı bilgi.`
        : `Uzunluk: caption toplam max ${max} karakter; en fazla 2–3 cümle.`

  return `Sen NaHaber ve Onyedi Tivi için Türkçe sosyal medya AI editörüsün.
Facebook, Instagram, Threads, X ve Hikâye paylaşımları için özgün caption / özet üretiyorsun.

AMAÇ: Organik erişim + doğru bilgi. Başlık manşetini AYNEN kopyalama; ama olguyu bozma. Caption hem merak uyandırsın hem bilgilendirsin.

OLGU SADAKATİ — KESİN:
- Sayı, özel isim, yer adı, unvan (Dr., Av., Prof.) ve isim tamlamasının baş ismini koru.
- YASAK: "avukat Dr." diye unvan+isim ortasında kesmek. DOĞRU: "avukat Dr. Gönenç Gürkaynak …" tam yaz.
- YASAK: "15 hava aracı müdahale etti" → "15 hava müdahale etti". DOĞRU: "15 hava aracı müdahale etti".
- Rakam uydurma / değiştirme yasak. Türkçe dilbilgisi doğru olsun.

KURALLAR:
1) caption: Haberi özgün cümlelerle özetle. İlk cümle merak + doğru olgu; devamında etki/sonuç. Başlıktaki kelime dizilimini aynen kopyalama ama kritik kelimeleri / unvan+isimi atma.
2) Ton: Ciddi yerel haber odası. Clickbait yasak ("şok", "inanılmaz", "son dakika bomba", sahte vaat).
3) ${igExtra}
4) YALNIZCA tamamlanmış cümleler. Yarım cümle, "…avukat Dr.", "…" ile biten teaser YASAK. Her cümle . ! veya ? ile bitsin.
5) URL / https / www / "tıkla" / "haberimizde" / "devamını oku" caption içinde YASAK.
6) hashtags: max 2; yalnızca #Çanakkale ve/veya #SonDakika. Konuya uymuyorsa boş dizi []. Başka etiket YASAK.
7) comment_text: Kısa yönlendirme, link YOK (sistem haber URL’sini ekler). Örn: "Haberin detayı:" veya "Ayrıntılar:"
8) Şehir bağlamını doğal kullan ama "📍 Şehir" satırını caption’a yazma — sistem ekler.
9) Çıktı YALNIZCA geçerli JSON, başka metin yok:
{"caption":"...","hashtags":["#Çanakkale","#SonDakika"],"comment_text":"Haberin detayı:"}`
}

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

/** Platform-scoped hash — story/FB cache IG caption’ını ezmesin. */
export function hashRewriteKey(
  title: string,
  content: string,
  articleUrl?: string,
  platform: SocialAiPlatform | 'generic' = 'generic',
): string {
  const body = articleUrl?.trim() || `${title.trim()}|${content.trim().slice(0, 800)}`
  const raw = `${platform}|${body}`.toLowerCase()
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
  if (!t) return t
  if (t.length <= max && !isIncompleteCaption(t)) return t
  const bySentence = clampCompleteSentences(t, max, max + 40)
  if (bySentence && !isIncompleteCaption(bySentence)) return bySentence.trim()
  // Hâlâ yarım (…Dr.) → bir cümle geri / kelime sınırı
  const slice = t.slice(0, max)
  const sp = slice.lastIndexOf(' ')
  const byWord = (sp > 80 ? slice.slice(0, sp) : slice).trim()
  if (!isIncompleteCaption(byWord)) return byWord
  return clampCompleteSentences(t, Math.max(60, Math.floor(max * 0.75)), max)
}

function finalizeCaption(caption: string, title: string, content: string, max = 220): string {
  return clampCaption(repairSocialCopyAgainstSource(caption, title, content), max)
}

function fallbackRewrite(
  title: string,
  content: string,
  city: string,
  max = 220,
): MetaAiRewriteResult {
  const base = stripUrls(content || title).replace(/\s+/g, ' ').trim()
  let caption = base
  const titleNorm = title.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
  if (
    !caption ||
    caption.toLocaleLowerCase('tr-TR') === titleNorm ||
    caption.toLocaleLowerCase('tr-TR').startsWith(titleNorm)
  ) {
    const words = title.split(/\s+/).filter(Boolean)
    const rotated = words.length >= 4 ? [...words.slice(2), ...words.slice(0, 2)].join(' ') : title
    caption = `${rotated}. ${city} gündeminde gelişmeler sürüyor.`
  }
  // Keep complete sentences within budget
  caption = finalizeCaption(caption, title, content, max)
  if (isIncompleteCaption(caption) || caption.length < 40) {
    caption = clampCompleteSentences(
      /[.!?…]["'»”’)\]]*$/.test(base) ? base : `${base}.`,
      max,
      max + 40,
    )
    if (!caption || isIncompleteCaption(caption)) {
      caption = clampCompleteSentences(`${title.trim()}.`, max, max + 24)
    }
  }
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

function captionPassesQuality(
  caption: string,
  platform: SocialAiPlatform,
  sourceContent: string,
): boolean {
  const t = caption.replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (isIncompleteCaption(t)) return false
  if (t.length < PLATFORM_MIN_CHARS[platform]) return false
  if (platform === 'instagram' && isThinSocialCaption(t, sourceContent)) return false
  return true
}

async function readCache(
  cacheKey: string,
  title: string,
  content: string,
  max: number,
): Promise<MetaAiRewriteResult | null> {
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
    const caption = finalizeCaption(d.caption, title, content, max)
    if (isIncompleteCaption(caption)) return null
    return {
      caption,
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
  platform?: SocialAiPlatform
}): Promise<void> {
  try {
    await getAdminFirestore().collection('aiRewriteCache').doc(cacheKey).set({
      caption: result.caption,
      hashtags: result.hashtags,
      comment_text: result.comment_text,
      title: meta.title.slice(0, 200),
      city: meta.city,
      articleUrl: meta.articleUrl ?? null,
      platform: meta.platform ?? null,
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
 * Timeout 6s → fallback. Platform-scoped hash within 24h → cache hit.
 */
export async function rewriteForSocial(
  title: string,
  content: string,
  city = 'Çanakkale',
  opts?: {
    articleUrl?: string
    newsId?: string
    skipCache?: boolean
    platform?: SocialAiPlatform
    maxChars?: number
  },
): Promise<MetaAiRewriteResult> {
  const platform = opts?.platform ?? 'facebook'
  const maxChars = opts?.maxChars ?? PLATFORM_CAPTION_MAX[platform]
  const cacheKey = hashRewriteKey(title, content, opts?.articleUrl, platform)

  if (!opts?.skipCache) {
    const cached = await readCache(cacheKey, title, content, maxChars)
    if (cached) {
      if (captionPassesQuality(cached.caption, platform, content)) {
        console.log(`[metaAiRewrite] cache hit key=${cacheKey} platform=${platform}`)
        return cached
      }
      console.warn(`[metaAiRewrite] cache thin/incomplete — ignore key=${cacheKey}`)
    }
  }

  const apiKey = await resolveLlamaApiKey()
  if (!apiKey) {
    console.error('[metaAiRewrite] LLAMA_API_KEY eksik — fallback')
    const fb = fallbackRewrite(title, content, city, maxChars)
    fb.error = 'LLAMA_API_KEY eksik'
    return { ...fb, cacheKey }
  }

  // Light client-side spacing
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt = Date.now()

  const userPrompt = `PLATFORM: ${platform}
ŞEHİR: ${city}
BAŞLIK: ${title}
İÇERİK: ${content.slice(0, 1800)}

JSON üret. caption max ~${maxChars} karakter; YALNIZCA tam cümleler; unvan+isim ortasında kesme.`

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
        max_completion_tokens: platform === 'instagram' ? 480 : 280,
        messages: [
          { role: 'system', content: buildSystemPrompt(platform, maxChars) },
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
      const fb = fallbackRewrite(title, content, city, maxChars)
      fb.error = json.error?.message ?? `HTTP ${res.status}`
      return { ...fb, cacheKey }
    }

    const raw = json.choices?.[0]?.message?.content ?? ''
    const parsed = parseLlamaJson(raw)
    if (!parsed?.caption?.trim()) {
      console.error('[metaAiRewrite] bad JSON — fallback')
      const fb = fallbackRewrite(title, content, city, maxChars)
      fb.error = 'bad JSON'
      return { ...fb, cacheKey }
    }

    let caption = finalizeCaption(parsed.caption, title, content, maxChars)
    if (!captionPassesQuality(caption, platform, content)) {
      console.error(
        `[metaAiRewrite] thin/incomplete caption platform=${platform} len=${caption.length} — fallback`,
      )
      const fb = fallbackRewrite(title, content, city, maxChars)
      fb.error = 'thin or incomplete caption'
      return { ...fb, cacheKey }
    }

    const result: MetaAiRewriteResult = {
      caption,
      hashtags: enforceHashtags(parsed.hashtags),
      comment_text: stripUrls(parsed.comment_text || 'Haberin detayı:'),
      source: 'llama',
      cacheKey,
    }

    await writeCache(cacheKey, result, {
      title,
      city,
      articleUrl: opts?.articleUrl,
      platform,
    })
    console.log(`[metaAiRewrite] llama ok key=${cacheKey} platform=${platform} len=${result.caption.length}`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = /abort|timeout/i.test(msg)
    console.error(`[metaAiRewrite] ${isTimeout ? 'AI timeout' : 'error'}:`, msg)
    const fb = fallbackRewrite(title, content, city, maxChars)
    fb.error = isTimeout ? 'AI timeout' : msg
    return { ...fb, cacheKey }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Platform-aware rewrite: toggle kapalıysa null; açıkken rewrite + platform max clamp.
 * AI fail → fallback caption (yine döner); asla throw etmez.
 * İnce/yarım caption → sourceContent üzerinden fallback (DeepSeek/spot).
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

  const max = PLATFORM_CAPTION_MAX[platform]
  const ai = await rewriteForSocial(title, content, city, {
    ...opts,
    platform,
    maxChars: max,
  })
  let caption = finalizeCaption(ai.caption, title, content, max)
  if (platform === 'story') {
    // clampCaption kelime ortasında bırakabilir; hikâyede yalnızca tam cümle.
    caption = clampCompleteSentences(caption, max, max + 32)
    caption = repairSocialCopyAgainstSource(caption, title, content)
  } else if (caption.length > max) {
    caption = finalizeCaption(caption, title, content, max)
  }

  if (!captionPassesQuality(caption, platform, content)) {
    const fb = fallbackRewrite(title, content, city, max)
    caption = fb.caption
    console.error(
      `[metaAiRewrite] ${platform} quality gate → source fallback news=${opts?.newsId ?? '?'}`,
    )
    return {
      ...ai,
      caption,
      source: 'fallback',
      error: ai.error || 'quality gate',
      enabled: true,
    }
  }

  if (ai.source === 'fallback' || ai.error) {
    console.error(`[metaAiRewrite] ${platform} fallback news=${opts?.newsId ?? '?'}: ${ai.error ?? 'AI timeout'}`)
  } else {
    console.log(`[metaAiRewrite] ${platform} ok source=${ai.source} len=${caption.length}`)
  }

  return { ...ai, caption, enabled: true }
}
