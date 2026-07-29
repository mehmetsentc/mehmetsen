import type { AiEditorDocument, AiPersonaType } from '@/types/aiEditor'
import { getAiEditorById, listAiEditors } from './aiEditorService'
import { hintCategoryFromText } from './categoryHint'
import { normalizeCitySlug } from '@/constants/cities'
import { slugifyCity } from '@/lib/location'

/** Default category → seed editor slug (Admin can override via editor.categoryIds). */
export const FALLBACK_CATEGORY_EDITOR_SLUG: Record<string, string> = {
  gundem: 'ece-yalin',
  trend: 'selin-aras',
  'son-dakika': 'arda-sahin',
  asayis: 'arda-sahin',
  siyaset: 'mert-karaca',
  dunya: 'defne-aksoy',
  'kibris-haberleri': 'defne-aksoy',
  ekonomi: 'kerem-aydin',
  'finans-piyasa': 'kerem-aydin',
  borsa: 'kerem-aydin',
  kripto: 'kerem-aydin',
  'emlak-konut': 'kerem-aydin',
  enerji: 'kerem-aydin',
  'is-kariyer': 'kerem-aydin',
  teknoloji: 'can-tunc',
  bilim: 'leyla-arin',
  'oyun-espor': 'can-tunc',
  spor: 'deniz-erdem',
  futbol: 'deniz-erdem',
  basketbol: 'deniz-erdem',
  voleybol: 'deniz-erdem',
  hentbol: 'deniz-erdem',
  atletizm: 'deniz-erdem',
  gures: 'deniz-erdem',
  'dunya-kupasi-2026': 'deniz-erdem',
  saglik: 'ipek-demir',
  yasam: 'selin-aras',
  astroloji: 'selin-aras',
  moda: 'selin-aras',
  'anne-cocuk': 'selin-aras',
  dekorasyon: 'selin-aras',
  iliskiler: 'selin-aras',
  gastronomi: 'selin-aras',
  kultur: 'asli-tan',
  sinema: 'asli-tan',
  tiyatro: 'asli-tan',
  konser: 'asli-tan',
  festival: 'asli-tan',
  tarih: 'asli-tan',
  turizm: 'derya-akin',
  gezi: 'derya-akin',
  otomobil: 'emre-sancar',
  egitim: 'zeynep-er',
  'cevre-iklim': 'baran-eren',
  meteoroloji: 'baran-eren',
  magazin: 'melis-kaya',
  'yerel-haber': 'burak-celik',
  'din-inanc': 'selin-aras',
  etkinlikler: 'selin-aras',
}

/** Secondary desk suggestions by primary category / event. */
export const SECONDARY_DESK_SLUG: Record<string, string> = {
  'cevre-iklim': 'baran-eren',
  meteoroloji: 'baran-eren',
  'yerel-haber+yangin': 'baran-eren',
  'yerel-haber+turizm': 'derya-akin',
}

const NON_ASSIGNABLE: Set<AiPersonaType> = new Set([
  'seo_editor',
  'verification_editor',
  'copy_editor',
  'columnist',
])

const FALLBACK_CATEGORY_SLUG = FALLBACK_CATEGORY_EDITOR_SLUG

let cache: { at: number; editors: AiEditorDocument[] } | null = null
const CACHE_MS = 60_000

async function activeEditors(): Promise<AiEditorDocument[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.editors
  const editors = await listAiEditors({ status: 'active', limit: 100 })
  cache = { at: Date.now(), editors }
  return editors
}

export function invalidateEditorRouterCache(): void {
  cache = null
}

export interface EditorRouteInput {
  categoryId?: string | null
  isBreaking?: boolean
  preferredAiEditorId?: string | null
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** Raw headline/body for auto-routing when category unknown. */
  text?: string | null
  citySlug?: string | null
  districtSlug?: string | null
  /** Below this confidence, fall back to Selin. */
  minConfidence?: number
}

export interface EditorialRouteResult {
  editor: AiEditorDocument | null
  secondaryEditorSlug: string | null
  categoryId: string | null
  citySlug: string | null
  districtSlug: string | null
  confidence: number
  reason: string
  autoRouted: boolean
}

function isAssignableNewsEditor(e: AiEditorDocument): boolean {
  if (e.assignableForNews === false) return false
  if (e.personaType && NON_ASSIGNABLE.has(e.personaType)) return false
  if (e.capabilities?.newsEnabled === false) return false
  return true
}

function findBySlug(editors: AiEditorDocument[], slug: string): AiEditorDocument | undefined {
  return editors.find((e) => e.slug === slug && e.status === 'active')
}

/** DRAFT_ONLY never auto-publishes. AUTO_PUBLISH and REQUIRES_APPROVAL both allow publish
 * (quality gates still apply). REQUIRES_APPROVAL is legacy — prefer AUTO_PUBLISH. */
export function aiEditorForcesDraft(
  policy: AiEditorDocument['publishPolicy'] | null | undefined
): boolean {
  return policy === 'DRAFT_ONLY'
}

/**
 * Pure assignment over an in-memory editor list (unit-testable).
 */
export function pickAiEditorFromList(
  editors: AiEditorDocument[],
  input: EditorRouteInput
): AiEditorDocument | null {
  const assignable = editors.filter((e) => e.status === 'active' && isAssignableNewsEditor(e))
  if (assignable.length === 0) return null

  if (input.preferredAiEditorId) {
    const forced = editors.find((e) => e.id === input.preferredAiEditorId && e.status === 'active')
    if (forced) return forced
  }

  let categoryId = (input.categoryId || '').trim()
  const hint =
    !categoryId && input.text
      ? hintCategoryFromText(input.text)
      : input.text
        ? hintCategoryFromText(input.text)
        : null

  if (!categoryId && hint) categoryId = hint.categoryId

  const citySlug =
    input.citySlug?.trim() ||
    (hint?.citySlug ? normalizeCitySlug(hint.citySlug) : '') ||
    ''

  if (input.articleFormat === 'column') {
    const withColumn = editors.filter(
      (e) =>
        e.status === 'active' &&
        (e.personaType === 'columnist' || (e.capabilities.columnEnabled && e.columnName))
    )
    const byCat = categoryId
      ? withColumn.find((e) => e.categoryIds.includes(categoryId))
      : undefined
    if (byCat) return byCat
    if (withColumn[0]) return withColumn[0]
  }

  if (input.isBreaking || categoryId === 'son-dakika') {
    const breaking =
      assignable.find(
        (e) => e.capabilities.breakingEnabled && e.categoryIds.includes('son-dakika')
      ) || findBySlug(assignable, 'arda-sahin')
    if (breaking) return breaking
  }

  if (categoryId === 'yerel-haber' || (citySlug && categoryId === 'yerel-haber')) {
    const local =
      assignable.find((e) => e.personaType === 'local_editor') ||
      findBySlug(assignable, 'burak-celik')
    if (local) return local
  }

  // City present + no strong national category → prefer local desk
  if (citySlug && (!categoryId || categoryId === 'gundem')) {
    const localSignal = hint?.categoryId === 'yerel-haber'
    if (localSignal) {
      const local =
        assignable.find((e) => e.personaType === 'local_editor') ||
        findBySlug(assignable, 'burak-celik')
      if (local) return local
    }
  }

  if (categoryId) {
    const byList = assignable.find((e) => e.categoryIds.includes(categoryId))
    if (byList) return byList

    const slug = FALLBACK_CATEGORY_SLUG[categoryId]
    if (slug) {
      const bySlug = findBySlug(assignable, slug)
      if (bySlug) return bySlug
    }
  }

  return findBySlug(assignable, 'selin-aras') ?? assignable[0] ?? null
}

/**
 * Full editorial routing with confidence + secondary desk.
 */
export function routeEditorialFromList(
  editors: AiEditorDocument[],
  input: EditorRouteInput
): EditorialRouteResult {
  const hint = input.text ? hintCategoryFromText(input.text) : null
  const categoryId = (input.categoryId || hint?.categoryId || '').trim() || null
  const cityRaw = input.citySlug || hint?.citySlug
  const citySlug = cityRaw
    ? normalizeCitySlug(cityRaw.includes('-') || /^[a-z0-9-]+$/.test(cityRaw) ? cityRaw : slugifyCity(cityRaw))
    : null
  const districtSlug = input.districtSlug || hint?.districtSlug || null

  const editor = pickAiEditorFromList(editors, {
    ...input,
    categoryId,
    citySlug,
  })

  const minConfidence = input.minConfidence ?? 0.55
  const confidence = hint?.confidence ?? (categoryId ? 0.75 : 0.4)
  let finalEditor = editor
  let reason = hint?.reason || (categoryId ? `kategori:${categoryId}` : 'genel yedek')
  let autoRouted = !input.preferredAiEditorId

  if (autoRouted && confidence < minConfidence) {
    finalEditor = findBySlug(editors, 'selin-aras') ?? editor
    reason = `düşük güven (${confidence.toFixed(2)}) → Genel Yayın`
  }

  let secondaryEditorSlug: string | null = null
  if (hint?.secondaryCategoryId) {
    secondaryEditorSlug = FALLBACK_CATEGORY_SLUG[hint.secondaryCategoryId] ?? null
  } else if (categoryId === 'yerel-haber' && hint?.reason.includes('yangın')) {
    secondaryEditorSlug = 'baran-eren'
  } else if (categoryId && SECONDARY_DESK_SLUG[categoryId]) {
    secondaryEditorSlug = SECONDARY_DESK_SLUG[categoryId]
  }

  if (secondaryEditorSlug && finalEditor?.slug === secondaryEditorSlug) {
    secondaryEditorSlug = null
  }

  return {
    editor: finalEditor,
    secondaryEditorSlug,
    categoryId,
    citySlug,
    districtSlug,
    confidence,
    reason,
    autoRouted,
  }
}

/**
 * Assign a persistent AI editor persona for a story.
 * Does not replace worker editorId — returns persona only.
 */
export async function routeAiEditor(input: EditorRouteInput): Promise<AiEditorDocument | null> {
  if (input.preferredAiEditorId) {
    const forced = await getAiEditorById(input.preferredAiEditorId)
    if (forced && forced.status === 'active') return forced
  }

  const editors = await activeEditors()
  return pickAiEditorFromList(editors, input)
}

export async function routeEditorial(input: EditorRouteInput): Promise<EditorialRouteResult> {
  if (input.preferredAiEditorId) {
    const forced = await getAiEditorById(input.preferredAiEditorId)
    if (forced && forced.status === 'active') {
      return {
        editor: forced,
        secondaryEditorSlug: null,
        categoryId: input.categoryId ?? null,
        citySlug: input.citySlug ?? null,
        districtSlug: input.districtSlug ?? null,
        confidence: 1,
        reason: 'manuel seçim',
        autoRouted: false,
      }
    }
  }
  const editors = await activeEditors()
  return routeEditorialFromList(editors, input)
}

export function authorFieldsFromEditor(editor: AiEditorDocument): {
  authorId: string
  authorUsername: string
  authorDisplayName: string
  authorPhotoURL: string | null
  author: string
  aiEditorId: string
} {
  return {
    authorId: editor.authorUid,
    authorUsername: editor.slug,
    authorDisplayName: editor.name,
    authorPhotoURL: editor.avatarUrl,
    author: editor.slug,
    aiEditorId: editor.id,
  }
}

/** Admin dropdown grouping label by desk / persona. */
export function editorSelectGroup(editor: AiEditorDocument): string {
  if (editor.personaType === 'columnist') return 'AI KÖŞE YAZARLARI'
  if (editor.personaType === 'local_editor') return 'YEREL'
  if (editor.personaType === 'breaking_editor') return 'SON DAKİKA'
  if (editor.personaType === 'senior_editor') return 'GENEL'
  if (editor.personaType === 'seo_editor' || editor.personaType === 'copy_editor' || editor.personaType === 'verification_editor') {
    return 'İÇ AJANLAR'
  }
  return (editor.desk || editor.primarySpecialization || 'MASA').toLocaleUpperCase('tr-TR')
}
