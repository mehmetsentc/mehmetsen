/**
 * Phase 4F.4.2 — canonical draft body word count from persisted snapshot.
 * Never returns fake 0 when body exists; null means unavailable.
 */

import { wordCount } from '../canary/schema'

export type DraftSnapshotLike = Record<string, unknown> | null | undefined

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asPositiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Canonical body word count for AI draft snapshots.
 * 1. draft_snapshot.quality.bodyWords when valid (>0)
 * 2. deterministic word count from draft_snapshot.body
 * 3. null — caller should show "Veri alınamadı"
 */
export function getDraftBodyWordCount(snapshot: DraftSnapshotLike): number | null {
  if (!snapshot) return null
  const quality = asRecord(snapshot.quality)
  const fromQuality = asPositiveInt(quality?.bodyWords)
  if (fromQuality != null) return fromQuality

  // Legacy/alternate keys — only when explicitly positive (never coerce missing to 0)
  for (const key of ['bodyWordCount', 'body_word_count', 'wordCount']) {
    const legacy = asPositiveInt(snapshot[key])
    if (legacy != null) return legacy
  }

  const body = asString(snapshot.body)
  if (body) {
    const n = wordCount(body)
    return n > 0 ? n : null
  }

  return null
}

/** CMS display helper — never shows misleading 0 for missing telemetry. */
export function formatDraftBodyWordCount(snapshot: DraftSnapshotLike): string {
  const n = getDraftBodyWordCount(snapshot)
  return n == null ? 'Veri alınamadı' : String(n)
}
