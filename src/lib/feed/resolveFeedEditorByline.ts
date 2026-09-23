import { TURKISH_PROVINCES } from '@/constants/cities'
import { FALLBACK_CATEGORY_EDITOR_SLUG } from '@/lib/ai/editorial/categoryEditorFallback'
import { findCityCategoryEditorSpec } from '@/lib/ai/editorial/seedCityCategoryEditors'
import { SEED_CITY_AI_EDITORS } from '@/lib/ai/editorial/seedCityEditors'
import { SEED_AI_EDITORS } from '@/lib/ai/editorial/seedEditors'
import { syntheticAiAuthorUid } from '@/types/aiEditor'

const CITY_NAMES = TURKISH_PROVINCES.map((p) => p.name.toLocaleLowerCase('tr-TR'))

const GENERIC_EDITOR_NAMES = new Set([
  'nahaber',
  'nahaber editör',
  'nahaber editor',
  'nahaber editörü',
  'na haber',
  'na haber editör',
  'na haber editor',
  'na haber editörü',
  'kaynak',
  'editör',
  'editor',
])

export function isGenericEditorName(name?: string | null): boolean {
  const n = name?.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
  if (!n) return true
  if (GENERIC_EDITOR_NAMES.has(n)) return true
  return /^na\s*haber(\s+edit[oö]r[uü]?)?$/.test(n)
}

const OUTLET_NAME_RE =
  /(gazete|ajans|kaynak|\.com|\.net|haberleri|milliyet|hürriyet|hurriyet|sabah|sözcü|sozcu|habertürk|haberturk|ntv|cnn|bbc|reuters|anadolu|dha|iha|anka)/i

/** Outlet / city / agency labels must never appear as the card byline. */
export function isSourceLikeName(
  name?: string | null,
  publisherName?: string | null
): boolean {
  if (isGenericEditorName(name)) return true
  const n = name?.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
  if (!n) return true
  const pub = publisherName?.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
  if (pub && n === pub) return true
  if (CITY_NAMES.some((city) => n === city || n.startsWith(`${city} `))) return true
  return OUTLET_NAME_RE.test(n)
}

function findSeedEditor(opts: {
  aiEditorId?: string | null
  citySlug?: string | null
  categoryId?: string | null
}) {
  const desk = findCityCategoryEditorSpec(opts.citySlug, opts.categoryId)
  if (desk) return desk

  const all = [...SEED_AI_EDITORS, ...SEED_CITY_AI_EDITORS]
  const rawId = opts.aiEditorId?.trim()
  if (rawId) {
    const key = rawId.replace(/^ai_editor_/, '')
    const hit = all.find((e) => e.slug === rawId || e.slug === key)
    if (hit) return hit
  }
  const city = opts.citySlug?.trim().toLowerCase()
  if (city) {
    const hit = SEED_CITY_AI_EDITORS.find((e) => e.citySlug === city)
    if (hit) return hit
  }
  return null
}

function nationalEditorForCategory(categoryId?: string | null) {
  const cat = categoryId?.trim().toLowerCase() || 'gundem'
  const slug = FALLBACK_CATEGORY_EDITOR_SLUG[cat] ?? 'selin-aras'
  return SEED_AI_EDITORS.find((e) => e.slug === slug) ?? SEED_AI_EDITORS.find((e) => e.slug === 'selin-aras') ?? null
}

export type FeedEditorByline = {
  name: string
  slug: string
  authorUid: string
}

export function resolveFeedEditorByline(opts: {
  authorName?: string | null
  authorId?: string | null
  aiEditorId?: string | null
  citySlug?: string | null
  categoryId?: string | null
  publisherName?: string | null
}): FeedEditorByline | null {
  const desk = findCityCategoryEditorSpec(opts.citySlug, opts.categoryId)
  const seed = findSeedEditor(opts)
  const rawName = opts.authorName?.trim() || null
  const useSeedName = Boolean(desk) || !rawName || isSourceLikeName(rawName, opts.publisherName)

  if (seed) {
    const existingId = opts.authorId?.trim() || ''
    return {
      name: useSeedName ? seed.name : rawName!,
      slug: seed.slug,
      authorUid: desk
        ? syntheticAiAuthorUid(seed.slug)
        : !useSeedName && existingId
          ? existingId
          : existingId.startsWith('ai_editor_')
            ? existingId
            : syntheticAiAuthorUid(seed.slug),
    }
  }

  if (rawName && !isSourceLikeName(rawName, opts.publisherName)) {
    const slug = (opts.authorId?.trim() || rawName)
      .toLocaleLowerCase('tr-TR')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    if (!slug) return null
    return {
      name: rawName,
      slug,
      authorUid: opts.authorId?.trim() || '',
    }
  }

  const national = nationalEditorForCategory(opts.categoryId)
  if (!national) return null
  return {
    name: national.name,
    slug: national.slug,
    authorUid: syntheticAiAuthorUid(national.slug),
  }
}
