/**
 * Past-news context for AI editor rewrite / review.
 * Reuses Firestore `news` published queries (same collection as editorial-review).
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { AiEditorDocument } from '@/types/aiEditor'
import { YEREL_HABER_CATEGORY_ID, YEREL_SUBCATEGORY_IDS } from '@/constants/config'

export interface EditorPastNewsItem {
  id: string
  title: string
  summary: string
  categoryId: string
  citySlug: string | null
  publishedAt: string | null
}

export function resolveManagedCategories(editor: AiEditorDocument): string[] {
  const managed = editor.managedCategories?.filter(Boolean)
  if (managed?.length) return [...new Set(managed)]
  if (editor.categoryIds?.length) return [...new Set(editor.categoryIds)]
  if (editor.personaType === 'local_editor') {
    return [YEREL_HABER_CATEGORY_ID, ...YEREL_SUBCATEGORY_IDS]
  }
  return []
}

export function resolveEditorCitySlug(editor: AiEditorDocument): string | null {
  const direct = editor.citySlug?.trim().toLowerCase()
  if (direct) return direct
  const priority = editor.localConfig?.priorityProvinces?.[0]?.trim().toLowerCase()
  return priority || null
}

function publishedAtIso(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString()
  if (raw && typeof raw === 'object' && '_seconds' in raw) {
    const seconds = Number((raw as { _seconds?: number })._seconds)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString()
  }
  return null
}

/**
 * Fetch last N published news for an editor's managed categories / city.
 * City editors prefer citySlug filter; national desks prefer categoryId.
 */
export async function fetchEditorPastNews(
  editor: AiEditorDocument,
  opts?: { limit?: number }
): Promise<EditorPastNewsItem[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 40)
  const db = getAdminFirestore()
  const citySlug = resolveEditorCitySlug(editor)
  const categories = resolveManagedCategories(editor)

  try {
    if (citySlug) {
      const snap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('citySlug', '==', citySlug)
        .orderBy('publishedAt', 'desc')
        .limit(limit)
        .get()
      if (!snap.empty) {
        return snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>
          return {
            id: d.id,
            title: String(data.title ?? ''),
            summary: String(data.summary ?? data.spot ?? '').slice(0, 180),
            categoryId: String(data.categoryId ?? data.category ?? ''),
            citySlug: String(data.citySlug ?? citySlug),
            publishedAt: publishedAtIso(data.publishedAt),
          }
        })
      }
    }

    const primary = categories[0]
    if (!primary) return []

    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('categoryId', '==', primary)
      .orderBy('publishedAt', 'desc')
      .limit(limit)
      .get()

    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        title: String(data.title ?? ''),
        summary: String(data.summary ?? data.spot ?? '').slice(0, 180),
        categoryId: String(data.categoryId ?? data.category ?? primary),
        citySlug: data.citySlug ? String(data.citySlug) : null,
        publishedAt: publishedAtIso(data.publishedAt),
      }
    })
  } catch (err) {
    console.warn(
      '[editorPastNews] query failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

/** Compact block for prompt injection (consistency / duplicate awareness). */
export function formatPastNewsForPrompt(items: EditorPastNewsItem[]): string {
  if (items.length === 0) return ''
  const lines = items.map((item, i) => {
    const meta = [item.categoryId, item.citySlug, item.publishedAt?.slice(0, 10)]
      .filter(Boolean)
      .join(' · ')
    return `${i + 1}. ${item.title}${item.summary ? ` — ${item.summary}` : ''}${meta ? ` (${meta})` : ''}`
  })
  return [
    'MASA ARŞİVİ — son yayınlanan haberler (tutarlılık / mükerrer kontrol; kopyalama yok):',
    ...lines,
    'Aynı olayı yeniden yazma; önemli yeni gelişme yoksa yükseltme / uyarı öner.',
  ].join('\n')
}
