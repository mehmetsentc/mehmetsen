import {
  CANARY_CATEGORY_IDS,
  CANARY_FIELD_LIMITS,
  emptyDraft,
  isValidImageFilename,
  isValidSlug,
  slugifyTr,
  wordCount,
} from './schema'
import type { CanaryDraftFields, CanaryValidationIssue, CanaryValidationResult } from './types'
import { CANARY_REQUIRED_FIELDS } from './types'

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max).trim()
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter(Boolean)
  if (typeof v === 'string') {
    return v
      .split(/[,;|]/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return []
}

function asInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Extract JSON object from model text (fence or first {...}). */
export function extractJsonObject(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence?.[1]?.trim() || trimmed
  try {
    return { ok: true, value: JSON.parse(candidate) }
  } catch {
    const obj = candidate.match(/\{[\s\S]*\}/)
    if (!obj?.[0]) return { ok: false, error: 'not_json' }
    try {
      return { ok: true, value: JSON.parse(obj[0]) }
    } catch {
      return { ok: false, error: 'json_parse_failed' }
    }
  }
}

export function coerceDraft(raw: unknown): CanaryDraftFields {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const draft = emptyDraft()
  draft.title = asString(o.title)
  draft.slug = asString(o.slug)
  draft.spot = asString(o.spot)
  draft.summary = asString(o.summary)
  draft.body = asString(o.body)
  draft.tags = asStringArray(o.tags)
  draft.category = asString(o.category)
  draft.seoTitle = asString(o.seoTitle)
  draft.seoDescription = asString(o.seoDescription)
  draft.seoKeywords = asStringArray(o.seoKeywords)
  draft.socialTitle = asString(o.socialTitle)
  draft.socialDescription = asString(o.socialDescription)
  draft.pushTitle = asString(o.pushTitle)
  draft.pushText = asString(o.pushText)
  draft.imageAlt = asString(o.imageAlt)
  draft.imageFilename = asString(o.imageFilename)
  draft.readingTime = asInt(o.readingTime)
  return draft
}

/**
 * Deterministic formatting repair — preferred over a second AI call.
 * Does not invent facts; only normalizes shape/lengths/slug/filename.
 */
export function repairDraftDeterministically(input: CanaryDraftFields): {
  draft: CanaryDraftFields
  repaired: boolean
} {
  const d = { ...input, tags: [...input.tags], seoKeywords: [...input.seoKeywords] }
  let repaired = false

  const ensure = (cond: boolean, apply: () => void) => {
    if (cond) {
      apply()
      repaired = true
    }
  }

  ensure(!d.slug || !isValidSlug(d.slug), () => {
    d.slug = slugifyTr(d.title || d.slug || 'haber') || 'haber-taslagi'
  })
  ensure(d.slug.length < 6, () => {
    d.slug = `${d.slug || 'haber'}-taslak`.slice(0, 120)
  })

  ensure(!CANARY_CATEGORY_IDS.has(d.category), () => {
    d.category = 'yerel-haber'
  })

  ensure(d.tags.length === 0, () => {
    d.tags = ['yerel', 'canakkale'].slice(0, CANARY_FIELD_LIMITS.tags.max)
  })
  if (d.tags.length > CANARY_FIELD_LIMITS.tags.max) {
    d.tags = d.tags.slice(0, CANARY_FIELD_LIMITS.tags.max)
    repaired = true
  }

  ensure(d.seoKeywords.length === 0, () => {
    d.seoKeywords = d.tags.slice(0, 4)
  })

  const lim = CANARY_FIELD_LIMITS
  const clipField = (key: keyof CanaryDraftFields, max: number) => {
    const v = d[key]
    if (typeof v === 'string' && v.length > max) {
      ;(d as Record<string, unknown>)[key] = clip(v, max)
      repaired = true
    }
  }
  clipField('title', lim.title.max)
  clipField('spot', lim.spot.max)
  clipField('summary', lim.summary.max)
  clipField('seoTitle', lim.seoTitle.max)
  clipField('seoDescription', lim.seoDescription.max)
  clipField('socialTitle', lim.socialTitle.max)
  clipField('socialDescription', lim.socialDescription.max)
  clipField('pushTitle', lim.pushTitle.max)
  clipField('pushText', lim.pushText.max)
  clipField('imageAlt', lim.imageAlt.max)

  ensure(!d.seoTitle, () => {
    d.seoTitle = clip(d.title, lim.seoTitle.max)
  })
  ensure(!d.seoDescription, () => {
    d.seoDescription = clip(d.summary || d.spot, lim.seoDescription.max)
  })
  ensure(!d.socialTitle, () => {
    d.socialTitle = clip(d.title, lim.socialTitle.max)
  })
  ensure(!d.socialDescription, () => {
    d.socialDescription = clip(d.summary || d.spot, lim.socialDescription.max)
  })
  ensure(!d.pushTitle, () => {
    d.pushTitle = clip(d.title, lim.pushTitle.max)
  })
  ensure(!d.pushText, () => {
    d.pushText = clip(d.spot || d.summary, lim.pushText.max)
  })
  ensure(!d.imageAlt, () => {
    d.imageAlt = clip(d.title, lim.imageAlt.max)
  })
  ensure(!d.imageFilename || !isValidImageFilename(d.imageFilename), () => {
    d.imageFilename = `${slugifyTr(d.title || 'haber') || 'haber'}.jpg`
  })

  const words = wordCount(d.body)
  ensure(d.readingTime < 1 || d.readingTime > 30, () => {
    d.readingTime = Math.max(1, Math.min(30, Math.ceil(words / 200) || 1))
  })

  // Soft body trim only if over hard max words — never pad with fabrication
  if (words > lim.body.max) {
    const parts = d.body.trim().split(/\s+/)
    d.body = parts.slice(0, lim.body.max).join(' ')
    repaired = true
  }

  return { draft: d, repaired }
}

export function validateCanaryDraft(raw: unknown, opts?: { allowRepair?: boolean }): CanaryValidationResult {
  const allowRepair = opts?.allowRepair !== false
  const issues: CanaryValidationIssue[] = []

  const parsed = typeof raw === 'string' ? extractJsonObject(raw) : { ok: true as const, value: raw }
  if (!parsed.ok) {
    return {
      ok: false,
      issues: [{ field: '_root', code: 'NOT_JSON', messageTr: 'Çıktı geçerli JSON değil.', severity: 'error' }],
      repaired: false,
      draft: null,
    }
  }

  let draft = coerceDraft(parsed.value)
  let repaired = false
  if (allowRepair) {
    const r = repairDraftDeterministically(draft)
    draft = r.draft
    repaired = r.repaired
  }

  for (const field of CANARY_REQUIRED_FIELDS) {
    const v = draft[field]
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0) || (field === 'readingTime' && !v)) {
      issues.push({
        field,
        code: 'REQUIRED',
        messageTr: `${field} zorunlu.`,
        severity: 'error',
      })
    }
  }

  if (draft.body && wordCount(draft.body) < CANARY_FIELD_LIMITS.body.min) {
    issues.push({
      field: 'body',
      code: 'BODY_TOO_SHORT',
      messageTr: `Gövde en az ${CANARY_FIELD_LIMITS.body.min} kelime olmalı (materyal yetmiyorsa kısaltma; uydurma yasak).`,
      severity: 'error',
    })
  }
  if (draft.body && wordCount(draft.body) > CANARY_FIELD_LIMITS.body.max) {
    issues.push({
      field: 'body',
      code: 'BODY_TOO_LONG',
      messageTr: `Gövde en fazla ${CANARY_FIELD_LIMITS.body.max} kelime olmalı.`,
      severity: 'error',
    })
  }
  if (draft.slug && !isValidSlug(draft.slug)) {
    issues.push({ field: 'slug', code: 'INVALID_SLUG', messageTr: 'Slug geçersiz.', severity: 'error' })
  }
  if (draft.imageFilename && !isValidImageFilename(draft.imageFilename)) {
    issues.push({
      field: 'imageFilename',
      code: 'INVALID_IMAGE_FILENAME',
      messageTr: 'Görsel dosya adı geçersiz (örn. haber-basligi.jpg).',
      severity: 'error',
    })
  }
  if (draft.category && !CANARY_CATEGORY_IDS.has(draft.category)) {
    issues.push({
      field: 'category',
      code: 'INVALID_CATEGORY',
      messageTr: 'Kategori NaHaber listesinde değil.',
      severity: 'error',
    })
  }
  if (draft.tags.length > 0 && (draft.tags.length < 2 || draft.tags.length > 8)) {
    issues.push({
      field: 'tags',
      code: 'TAG_COUNT',
      messageTr: 'Etiket sayısı 2–8 olmalı.',
      severity: 'error',
    })
  }

  const lengthChecks: Array<[keyof CanaryDraftFields, number, number]> = [
    ['title', CANARY_FIELD_LIMITS.title.min, CANARY_FIELD_LIMITS.title.max],
    ['spot', CANARY_FIELD_LIMITS.spot.min, CANARY_FIELD_LIMITS.spot.max],
    ['summary', CANARY_FIELD_LIMITS.summary.min, CANARY_FIELD_LIMITS.summary.max],
    ['seoTitle', CANARY_FIELD_LIMITS.seoTitle.min, CANARY_FIELD_LIMITS.seoTitle.max],
    ['seoDescription', CANARY_FIELD_LIMITS.seoDescription.min, CANARY_FIELD_LIMITS.seoDescription.max],
  ]
  for (const [field, min, max] of lengthChecks) {
    const v = draft[field]
    if (typeof v === 'string' && v && (v.length < min || v.length > max)) {
      issues.push({
        field,
        code: 'LENGTH',
        messageTr: `${field} uzunluğu ${min}–${max} olmalı.`,
        severity: 'error',
      })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    ok: errors.length === 0,
    issues,
    repaired,
    draft: errors.length === 0 ? draft : draft,
  }
}
