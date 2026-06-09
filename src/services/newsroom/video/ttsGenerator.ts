/**
 * Google Cloud Text-to-Speech Generator
 * Converts AI-generated voiceText to Turkish MP3 audio.
 * Uploads to Firebase Storage, returns public download URL.
 *
 * Pricing: Free up to 1M standard chars/month (WaveNet: 1M chars/month free on trial)
 * Turkish voices: tr-TR-Standard-A/B/C/D  (female/male)
 *                 tr-TR-Wavenet-A/B/C/D/E (higher quality)
 *
 * Requires env: GOOGLE_TTS_API_KEY  OR  GOOGLE_APPLICATION_CREDENTIALS (service account)
 */

import { getAdminStorage } from '@/lib/firebase/admin'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

// WaveNet is higher quality but same free quota on trial projects
const VOICE_NAME = process.env.GOOGLE_TTS_VOICE ?? 'tr-TR-Wavenet-D'  // Male, clear newsreader voice
const SPEAKING_RATE = 1.1   // Slightly faster — news broadcast pace
const AUDIO_ENCODING = 'MP3'
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`

export interface TtsResult {
  audioUrl: string
  audioDurationMs?: number
  storagePath: string
}

/**
 * Generate Turkish TTS audio from voiceText.
 * @param voiceText - The text to synthesize (max ~5000 chars for a single request)
 * @param videoId   - Used as the storage filename
 */
export async function generateTtsAudio(voiceText: string, videoId: string): Promise<TtsResult | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) {
    console.warn('[ttsGenerator] GOOGLE_TTS_API_KEY not set — skipping TTS')
    return null
  }

  // Trim to 4800 chars to stay safely under API limits
  const text = voiceText.slice(0, 4800)

  try {
    // 1. Call Google TTS API
    const ttsRes = await fetch(`${TTS_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'tr-TR',
          name: VOICE_NAME,
        },
        audioConfig: {
          audioEncoding: AUDIO_ENCODING,
          speakingRate: SPEAKING_RATE,
          pitch: 0,
          volumeGainDb: 0,
        },
      }),
    })

    if (!ttsRes.ok) {
      const errText = await ttsRes.text()
      console.error('[ttsGenerator] API error:', ttsRes.status, errText.slice(0, 200))
      return null
    }

    const ttsJson = await ttsRes.json() as { audioContent: string }
    const audioBase64 = ttsJson.audioContent
    if (!audioBase64) {
      console.error('[ttsGenerator] empty audioContent')
      return null
    }

    // 2. Decode base64 → Buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64')

    // 3. Upload to Firebase Storage
    const storagePath = `videos/audio/${videoId}.mp3`
    const bucket = getAdminStorage().bucket(STORAGE_BUCKET)
    const file = bucket.file(storagePath)

    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000',  // Cache 1 year (audio files don't change)
      },
    })

    // Make public and get download URL
    await file.makePublic()
    const audioUrl = `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`

    console.log(`[ttsGenerator] ✓ audio uploaded: ${storagePath} (${audioBuffer.length} bytes)`)
    return { audioUrl, storagePath }

  } catch (err) {
    console.error('[ttsGenerator] failed:', err)
    return null
  }
}
