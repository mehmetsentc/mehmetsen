/**
 * AI Video Script Generator
 * Generates 60-second video scripts from published news articles.
 * Uses GPT-4o-mini for speed and cost efficiency at high volume.
 */

export interface VideoScript {
  videoTitle: string
  videoDescription: string
  voiceText: string
  hashtags: string[]
  thumbnailPrompt: string
  durationSeconds: number
  segments: VideoSegment[]
}

export interface VideoSegment {
  label: string
  text: string
  durationSeconds: number
}

export interface VideoScriptInput {
  title: string
  spot?: string
  summary?: string
  content?: string
  categoryId?: string
}

const SYSTEM_PROMPT = `Sen Türkiye'nin en iyi dijital haber stüdyosunun yapay zeka video editörüsün.
Sana bir haber veriyorum. 60 saniyelik dikey format (TikTok/Instagram Reels) video senaryosu oluştur.

JSON formatında yanıt ver:
{
  "videoTitle": "Dikkat çekici video başlığı, 60 karakter max",
  "videoDescription": "Video açıklaması, 150 karakter, izleyiciyi merak uyandırır",
  "voiceText": "Spikerın okuyacağı tam metin, 60 saniyede okunabilir (~140 kelime), akıcı Türkçe, haber dili",
  "hashtags": ["#haber", "#nahaber", "#türkiye", "#kategori_etiketi"],
  "thumbnailPrompt": "İngilizce thumbnail image generation prompt, cinematic, news style, no text",
  "durationSeconds": 60,
  "segments": [
    {"label": "Hook", "text": "İlk 5 saniyede izleyiciyi yakalayan cümle", "durationSeconds": 5},
    {"label": "Ana Haber", "text": "Haberin özü, 5W+1H", "durationSeconds": 30},
    {"label": "Bağlam", "text": "Arka plan ve önemi", "durationSeconds": 15},
    {"label": "Kapanış", "text": "CTA ve nahaber.com atıfı", "durationSeconds": 10}
  ]
}`

export async function generateVideoScript(input: VideoScriptInput): Promise<VideoScript | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[videoScript] OPENAI_API_KEY not set')
    return null
  }

  const articleText = [
    `Başlık: ${input.title}`,
    input.spot ? `Spot: ${input.spot}` : '',
    input.summary ? `Özet: ${input.summary}` : '',
    input.content ? `İçerik: ${input.content.slice(0, 800)}` : '',
  ].filter(Boolean).join('\n\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: articleText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!res.ok) {
      console.error('[videoScript] OpenAI error:', res.status)
      return null
    }

    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const content = json.choices[0]?.message?.content
    if (!content) return null

    return JSON.parse(content) as VideoScript
  } catch (err) {
    console.error('[videoScript] generation failed:', err)
    return null
  }
}

// ── Multi-length scripts ────────────────────────────────────────────────

export interface MultiLengthScripts {
  script30s: string   // Hook + core fact — 30 seconds (~65 words)
  script60s: string   // Full voiceText above — 60 seconds (~140 words)
  script90s: string   // Extended with context + CTA — 90 seconds (~210 words)
}

function buildMultiLengthSystemPrompt(): string {
  return `Sen Türkiye'nin en iyi dijital haber stüdyosunun yapay zeka video editörüsün.
Sana bir haber veriyorum. 3 farklı uzunlukta video spikerı metni oluştur.

JSON formatında yanıt ver:
{
  "script30s": "30 saniyelik (~65 kelime) metin: çarpıcı hook + en önemli tek gerçek. TikTok Shorts formatı.",
  "script60s": "60 saniyelik (~140 kelime) metin: hook + olayın özü (5W+1H) + bağlam + NaHaber CTA.",
  "script90s": "90 saniyelik (~210 kelime) metin: hook + detaylı haber + arka plan + uzman bağlamı + CTA."
}
Tüm metinler akıcı, spikerın okuduğu gibi, noktalama dahil. Haber dilinde, canlı, enerjik Türkçe.`
}

/** Generate 30s/60s/90s voice scripts in one API call. */
export async function generateMultiLengthScripts(
  input: VideoScriptInput
): Promise<MultiLengthScripts | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const articleText = [
    `Başlık: ${input.title}`,
    input.spot ? `Spot: ${input.spot}` : '',
    input.summary ? `Özet: ${input.summary}` : '',
    input.content ? `İçerik: ${input.content.slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildMultiLengthSystemPrompt() },
          { role: 'user', content: articleText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 800,
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const raw = json.choices[0]?.message?.content
    if (!raw) return null
    return JSON.parse(raw) as MultiLengthScripts
  } catch {
    return null
  }
}

// ── Social media captions ────────────────────────────────────────────────

export interface SocialCaptions {
  twitter: string      // ≤280 chars, punchy, with hashtags
  instagram: string    // 150-200 chars + 5-8 hashtags
  whatsapp: string     // Plain text, 1-2 sentences, no hashtags, shareable
}

function buildSocialCaptionSystemPrompt(): string {
  return `Sen NaHaber'in sosyal medya editörüsün.
Verilen haber için 3 farklı platform için Türkçe paylaşım metni oluştur.

JSON formatında yanıt ver:
{
  "twitter": "Tweet metni ≤280 karakter, merak uyandıran, 2-3 hashtag, 🔴 veya emoji kullan, nahaber.com linki için yer bırak.",
  "instagram": "Instagram açıklaması 150-200 karakter, duygusal/merak uyandıran dil, 5-8 Türkçe hashtag. Emoji kullan.",
  "whatsapp": "WhatsApp için paylaşılabilir 1-2 cümle, sade dil, hashtag yok, insanın 'wow' diyeceği bir ifade."
}
Her platform için tonunu optimize et. Hepsinde haber doğruluğunu koru.`
}

/** Generate social media captions for Twitter, Instagram, and WhatsApp. */
export async function generateSocialCaptions(
  input: VideoScriptInput
): Promise<SocialCaptions | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const articleText = `Başlık: ${input.title}\n${input.spot ?? input.summary ?? ''}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSocialCaptionSystemPrompt() },
          { role: 'user', content: articleText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 400,
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const raw = json.choices[0]?.message?.content
    if (!raw) return null
    return JSON.parse(raw) as SocialCaptions
  } catch {
    return null
  }
}

/** Fallback: generate a basic script without AI for offline/test scenarios */
export function fallbackVideoScript(input: VideoScriptInput): VideoScript {
  const words = (input.spot || input.summary || input.title).slice(0, 700)
  return {
    videoTitle: input.title.slice(0, 60),
    videoDescription: (input.summary ?? input.title).slice(0, 150),
    voiceText: `${input.title}. ${words}. Devamı için NaHaber'i takip edin.`,
    hashtags: ['#haber', '#nahaber', '#türkiye'],
    thumbnailPrompt: 'Breaking news background, Turkish flag, professional news studio lighting, cinematic',
    durationSeconds: 60,
    segments: [
      { label: 'Hook', text: input.title, durationSeconds: 5 },
      { label: 'Ana Haber', text: words.slice(0, 400), durationSeconds: 45 },
      { label: 'Kapanış', text: 'Devamı için NaHaber\'i takip edin.', durationSeconds: 10 },
    ],
  }
}
