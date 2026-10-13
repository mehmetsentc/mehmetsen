'use client'

import { auth } from '@/lib/firebase/auth'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

export async function reelsCall<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}`, status: res.status }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Ağ hatası — istek sunucuya ulaşmadı' }
  }
}

export type VoiceInfo = { name: string; gender: 'FEMALE' | 'MALE' | 'NEUTRAL' | 'UNKNOWN'; tier: string }
export type VoiceSettings = { defaultVoice: string | null; rate: number | null; categoryVoices: Record<string, string>; updatedAt?: number | null }
export type VoicesResponse = {
  voices: VoiceInfo[]
  catalogSource: 'google' | 'static'
  settings: VoiceSettings
  effective: { voice: string; rate: number; source: string }
  ttsReady: boolean
}

export const TIER_TEXT: Record<string, string> = { standard: 'Standard', wavenet: 'WaveNet', neural2: 'Neural2', chirp: 'Chirp 3 HD', studio: 'Studio' }
export const GENDER_TEXT: Record<VoiceInfo['gender'], string> = { FEMALE: 'Kadın', MALE: 'Erkek', NEUTRAL: 'Nötr', UNKNOWN: '—' }

/** "tr-TR-Chirp3-HD-Kore" → "Chirp 3 HD · Kore" */
export function voiceLabel(name: string): string {
  const rest = name.replace(/^tr-TR-/, '')
  const m = rest.match(/^(Standard|Wavenet|Neural2|Studio|Chirp3-HD|Chirp-HD)-(.+)$/)
  if (!m) return rest
  const fam = m[1] === 'Chirp3-HD' ? 'Chirp 3 HD' : m[1] === 'Wavenet' ? 'WaveNet' : m[1]!.replace('-', ' ')
  return `${fam} · ${m[2]}`
}
