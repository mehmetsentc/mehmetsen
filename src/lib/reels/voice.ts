import 'server-only'

/**
 * REELS-1 — Google Cloud Text-to-Speech → PCM16 WAV buffer (no storage upload).
 * Env: GOOGLE_TTS_API_KEY (restricted to the TTS API), GOOGLE_TTS_VOICE
 * (default tr-TR-Standard-D), GOOGLE_TTS_RATE (default 1.05).
 */
import { refundTtsChars, reserveTtsChars } from './ttsQuota'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

export function reelVoiceConfig(): { voice: string; rate: number; ready: boolean } {
  const rate = Number(process.env.GOOGLE_TTS_RATE)
  return {
    voice: process.env.GOOGLE_TTS_VOICE?.trim() || 'tr-TR-Standard-D',
    rate: Number.isFinite(rate) && rate > 0.5 && rate < 2 ? rate : 1.05,
    ready: Boolean(process.env.GOOGLE_TTS_API_KEY?.trim()),
  }
}

export async function synthesizeReelVoice(
  text: string,
  signal?: AbortSignal,
  choice?: { voice?: string | null; rate?: number | null },
): Promise<Buffer> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (!key) throw new Error('reels: GOOGLE_TTS_API_KEY is not set')
  const env = reelVoiceConfig()
  const voice = choice?.voice || env.voice
  const rate = choice?.rate ?? env.rate
  const input = text.slice(0, 4800)
  // Free-tier guard: reserve the characters first (throws TtsQuotaError at the cap).
  const reservation = await reserveTtsChars(input, voice)
  try {
    return await callGoogleTts(key, input, voice, rate, signal)
  } catch (err) {
    await refundTtsChars(reservation)
    throw err
  }
}

async function callGoogleTts(key: string, input: string, voice: string, rate: number, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(`${TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: input },
      voice: { languageCode: 'tr-TR', name: voice },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: rate },
    }),
    signal,
  })
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200)
    throw new Error(`reels: Google TTS ${res.status}: ${body}`)
  }
  const json = (await res.json()) as { audioContent?: string }
  if (!json.audioContent) throw new Error('reels: Google TTS returned no audio')
  return Buffer.from(json.audioContent, 'base64') // LINEAR16 comes with a WAV header
}
