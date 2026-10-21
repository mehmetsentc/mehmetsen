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

export type ReelJobState = { jobId: string; status: 'running' | 'done' | 'failed'; result: unknown; error: string | null; httpStatus: number | null }

/** Poll interval and limit for background reel jobs (server limit 800 s). */
export const REEL_JOB_POLL_MS = 4000
export const REEL_JOB_MAX_MS = 14 * 60 * 1000

/**
 * REELS-12: start a background reel job (POST {..., async: true} or a prepare call that
 * answers 202 { job }) and poll `${path}?job=` until it finishes. Cloudflare closes plain
 * requests at 100 s, which is why long renders / shares no longer wait in one request.
 * A server that still answers synchronously (no job) is returned as is.
 */
export async function runReelJob(
  path: string,
  body: Record<string, unknown>,
  onTick?: (elapsedMs: number) => void,
): Promise<{ ok: true; job: ReelJobState } | { ok: false; error: string; status?: number }> {
  const started = await reelsCall<{ job?: ReelJobState }>('POST', path, body)
  if (!started.ok) return started
  const first = started.data.job
  // an older server that answers synchronously: wrap the body as a finished job
  if (!first?.jobId) return { ok: true, job: { jobId: '', status: 'done', result: started.data, error: null, httpStatus: 200 } }
  const t0 = Date.now()
  let job: ReelJobState = first
  let misses = 0
  const sep = path.includes('?') ? '&' : '?'
  while (job.status === 'running') {
    if (Date.now() - t0 > REEL_JOB_MAX_MS) return { ok: false, error: 'İş çok uzun sürdü; birkaç dakika sonra sonucu kontrol edin' }
    await new Promise((r) => setTimeout(r, REEL_JOB_POLL_MS))
    onTick?.(Date.now() - t0)
    const r = await reelsCall<{ job: ReelJobState }>('GET', `${path}${sep}job=${encodeURIComponent(first.jobId)}`)
    if (!r.ok) {
      // a short network hiccup must not lose a job that keeps running on the server
      if (++misses >= 5) return r
      continue
    }
    misses = 0
    job = r.data.job
  }
  if (job.status === 'failed') return { ok: false, error: job.error ?? 'İş başarısız', status: job.httpStatus ?? 500 }
  return { ok: true, job }
}

/** Render-style job: the finished job's result is the response body `T`. */
export async function reelsJob<T>(path: string, body: Record<string, unknown>, onTick?: (elapsedMs: number) => void): Promise<ApiResult<T>> {
  const r = await runReelJob(path, body, onTick)
  if (!r.ok) return r
  return { ok: true, data: r.job.result as T }
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
