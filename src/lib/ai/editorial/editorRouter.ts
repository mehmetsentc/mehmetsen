import type { AiEditorDocument } from '@/types/aiEditor'
import { getAiEditorById, listAiEditors } from './aiEditorService'

/** Default category → seed editor slug (Admin can override via editor.categoryIds). */
export const FALLBACK_CATEGORY_EDITOR_SLUG: Record<string, string> = {
  gundem: 'selin-aras',
  'son-dakika': 'arda-sahin',
  asayis: 'arda-sahin',
  siyaset: 'mert-karaca',
  dunya: 'defne-aksoy',
  'kibris-haberleri': 'defne-aksoy',
  ekonomi: 'kerem-aydin',
  'finans-piyasa': 'kerem-aydin',
  borsa: 'kerem-aydin',
  kripto: 'kerem-aydin',
  teknoloji: 'ece-yalin',
  bilim: 'ece-yalin',
  'oyun-espor': 'ece-yalin',
  spor: 'deniz-erdem',
  futbol: 'deniz-erdem',
  basketbol: 'deniz-erdem',
  voleybol: 'deniz-erdem',
  yasam: 'ipek-demir',
  kultur: 'ipek-demir',
  turizm: 'ipek-demir',
  gezi: 'ipek-demir',
  gastronomi: 'ipek-demir',
  sinema: 'ipek-demir',
  tiyatro: 'ipek-demir',
}

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
  if (editors.length === 0) return null

  if (input.preferredAiEditorId) {
    const forced = editors.find((e) => e.id === input.preferredAiEditorId && e.status === 'active')
    if (forced) return forced
  }

  const categoryId = (input.categoryId || '').trim()

  if (input.isBreaking || categoryId === 'son-dakika') {
    const breaking = editors.find(
      (e) => e.capabilities.breakingEnabled && e.categoryIds.includes('son-dakika')
    )
    if (breaking) return breaking
  }

  if (input.articleFormat === 'column') {
    const withColumn = editors.filter((e) => e.capabilities.columnEnabled && e.columnName)
    const byCat = categoryId
      ? withColumn.find((e) => e.categoryIds.includes(categoryId))
      : undefined
    if (byCat) return byCat
    if (withColumn[0]) return withColumn[0]
  }

  if (categoryId) {
    const byList = editors.find((e) => e.categoryIds.includes(categoryId))
    if (byList) return byList

    const slug = FALLBACK_CATEGORY_SLUG[categoryId]
    if (slug) {
      const bySlug = editors.find((e) => e.slug === slug)
      if (bySlug) return bySlug
    }
  }

  return editors.find((e) => e.slug === 'selin-aras') ?? editors[0] ?? null
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
