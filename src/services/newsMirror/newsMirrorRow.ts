import type { newsReadMirror } from '@/db/schema/newsReadMirror'

/**
 * Pure Firestore doc -> news_read_mirror row mapping. No server-only / db imports,
 * so the backfill script (tsx) and tests can use it directly.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** Firestore value -> JSON. Timestamps become ISO strings (both news mappers accept them). */
export function toMirrorJson(value: unknown): Json {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (Array.isArray(value)) return value.map(toMirrorJson)
  if (typeof value === 'object') {
    const v = value as Record<string, unknown> & { toDate?: () => Date; latitude?: number; longitude?: number; path?: string }
    if (typeof v.toDate === 'function') {
      try {
        const d = v.toDate()
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
      } catch {
        return null
      }
    }
    // GeoPoint
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) {
      return { latitude: v.latitude, longitude: v.longitude }
    }
    // DocumentReference
    if (typeof v.path === 'string' && typeof (v as { firestore?: unknown }).firestore === 'object') {
      return v.path
    }
    const out: Record<string, Json> = {}
    for (const [k, inner] of Object.entries(v)) {
      if (inner === undefined || typeof inner === 'function') continue
      out[k] = toMirrorJson(inner)
    }
    return out
  }
  return null
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function date(v: Json | undefined): Date | null {
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isFinite(ms) ? new Date(ms) : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v)
  return null
}

export type NewsMirrorRow = typeof newsReadMirror.$inferInsert

/** Firestore doc -> mirror row. Exported for the backfill script and tests. */
export function toNewsMirrorRow(id: string, data: Record<string, unknown>): NewsMirrorRow {
  const doc = toMirrorJson(data) as Record<string, Json>
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').slice(0, 64)
    : null
  const views =
    typeof data.viewsCount === 'number' ? data.viewsCount : typeof data.views === 'number' ? data.views : 0
  return {
    id,
    slug: str(data.slug, 512) ?? id,
    status: str(data.status, 32) ?? 'unknown',
    publishedAt: date(doc.publishedAt),
    createdAt: date(doc.createdAt),
    updatedAt: date(doc.updatedAt),
    categoryId: str(data.categoryId ?? data.category, 128),
    citySlug: str(data.citySlug, 128)?.toLowerCase() ?? null,
    districtSlug: str(data.districtSlug, 128)?.toLowerCase() ?? null,
    authorId: str(data.authorId, 128),
    tags,
    views: Number.isFinite(views) ? Math.max(0, Math.min(2_147_483_647, Math.round(views))) : 0,
    doc,
    mirroredAt: new Date(),
  }
}

