import 'server-only'

/**
 * GEMINI TTS — üç yoldan sırayla dener (ilk başarılı kullanılır):
 *   1. Cloud Text-to-Speech + sunucu hizmet hesabı (OAuth). Gemini-TTS için hesapta
 *      `aiplatform.endpoints.predict` izni (roles/aiplatform.user) gerekir.
 *   2. Cloud Text-to-Speech + GOOGLE_TTS_API_KEY (API anahtarıyla Gemini-TTS çoğu projede reddedilir).
 *   3. Gemini API (GEMINI_API_KEY, AI Studio; ön ödemeli kredi gerekir).
 * Başarısız yol 10 dk atlanır (her istekte boşuna beklenmez). Anahtar / token loglara ve hata metnine yazılmaz.
 */
import { getAdminAccessToken } from '@/lib/firebase/admin'

const CLOUD = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const GEMINI_API_MODEL = 'gemini-2.5-flash-preview-tts'
const SKIP_MS = 10 * 60_000

export type GeminiTtsRequest = { text: string; prompt: string; voice: string; model?: string; signal?: AbortSignal }
export type GeminiTtsVia = 'cloud-sa' | 'cloud-key' | 'gemini-api'

export class GeminiTtsUnavailable extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Gemini sesi üretilemedi — ${reasons.join(' · ')}`)
    this.name = 'GeminiTtsUnavailable'
  }
}

const failedUntil = new Map<GeminiTtsVia, number>()
const LABEL: Record<GeminiTtsVia, string> = { 'cloud-sa': 'Google Cloud (hizmet hesabı)', 'cloud-key': 'Google Cloud (API anahtarı)', 'gemini-api': 'Gemini API (AI Studio)' }

/** kısa, gizli değer içermeyen Türkçe neden */
export function reasonOf(status: number, body: string): string {
  const b = body.replace(/key=[^&\s"]+/g, 'key=***').replace(/AIza[0-9A-Za-z_-]{20,}/g, '***')
  if (status === 402 || /prepayment|credits are depleted|billing/i.test(b)) return 'kredi / faturalandırma yok'
  if (status === 403 && /aiplatform/i.test(b)) return 'izin yok (Vertex AI: aiplatform.endpoints.predict)'
  if (status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(b)) return 'API bu projede açık değil'
  if (status === 403) return 'izin yok'
  if (status === 401) return 'kimlik doğrulanamadı'
  if (status === 429) return 'kota doldu'
  const m = b.match(/"message":\s*"([^"]{0,140})/)
  return `HTTP ${status}${m ? `: ${m[1]}` : ''}`
}

function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function viaCloud(r: GeminiTtsRequest, auth: { bearer: string } | { key: string }): Promise<Buffer> {
  const url = 'key' in auth ? `${CLOUD}?key=${encodeURIComponent(auth.key)}` : CLOUD
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...('bearer' in auth ? { Authorization: `Bearer ${auth.bearer}` } : {}) },
    body: JSON.stringify({
      input: { text: r.text, prompt: r.prompt },
      voice: { languageCode: 'tr-TR', name: r.voice, modelName: r.model ?? 'gemini-2.5-flash-tts' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
    signal: r.signal,
  })
  if (!res.ok) throw Object.assign(new Error('cloud'), { reason: reasonOf(res.status, await res.text()) })
  const j = (await res.json()) as { audioContent?: string }
  if (!j.audioContent) throw Object.assign(new Error('cloud'), { reason: 'boş ses döndü' })
  return Buffer.from(j.audioContent, 'base64') // LINEAR16 WAV başlıklı gelir
}

async function viaGeminiApi(r: GeminiTtsRequest, key: string): Promise<Buffer> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_API_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${r.prompt}\n\nMetin:\n${r.text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: r.voice } } } },
    }),
    signal: r.signal,
  })
  if (!res.ok) throw Object.assign(new Error('gemini'), { reason: reasonOf(res.status, await res.text()) })
  const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> }
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
  if (!part?.data) throw Object.assign(new Error('gemini'), { reason: 'boş ses döndü' })
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1] ?? 24000)
  return pcmToWav(Buffer.from(part.data, 'base64'), rate)
}

export async function synthesizeGeminiTts(r: GeminiTtsRequest): Promise<{ wav: Buffer; via: GeminiTtsVia }> {
  const reasons: string[] = []
  const now = Date.now()
  const tries: Array<[GeminiTtsVia, () => Promise<Buffer | null>]> = [
    ['cloud-sa', async () => {
      const bearer = await getAdminAccessToken()
      return bearer ? viaCloud(r, { bearer }) : null
    }],
    ['cloud-key', async () => {
      const key = process.env.GOOGLE_TTS_API_KEY?.trim()
      return key ? viaCloud(r, { key }) : null
    }],
    ['gemini-api', async () => {
      const key = process.env.GEMINI_API_KEY?.trim()
      return key ? viaGeminiApi(r, key) : null
    }],
  ]
  for (const [via, run] of tries) {
    if ((failedUntil.get(via) ?? 0) > now) {
      reasons.push(`${LABEL[via]}: kısa süre önce başarısız`)
      continue
    }
    try {
      const wav = await run()
      if (!wav) {
        reasons.push(`${LABEL[via]}: yapılandırılmamış`)
        continue
      }
      failedUntil.delete(via)
      return { wav, via }
    } catch (err) {
      if (r.signal?.aborted) throw err
      const reason = (err as { reason?: string }).reason ?? (err instanceof Error && err.name === 'TimeoutError' ? 'zaman aşımı' : 'bağlantı hatası')
      reasons.push(`${LABEL[via]}: ${reason}`)
      failedUntil.set(via, now + SKIP_MS)
      console.warn('[gemini-tts]', via, reason)
    }
  }
  throw new GeminiTtsUnavailable(reasons)
}
