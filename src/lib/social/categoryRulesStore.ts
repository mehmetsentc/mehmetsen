/**
 * Server-only: Firestore config/socialCategoryRules okuma/yazma.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  normalizeCategoryRulesDoc,
  type SocialCategoryRulesDoc,
  type SocialCategoryRule,
  FALLBACK_CATEGORY_RULE,
} from './categoryRules'

const DOC_PATH = { collection: 'config', id: 'socialCategoryRules' } as const

let cache: { doc: SocialCategoryRulesDoc; at: number } | null = null
const CACHE_TTL_MS = 60_000

export function invalidateCategoryRulesCache() {
  cache = null
}

export async function getCategoryRulesDoc(): Promise<SocialCategoryRulesDoc> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.doc
  try {
    const db = getAdminFirestore()
    const snap = await db.collection(DOC_PATH.collection).doc(DOC_PATH.id).get()
    const doc = normalizeCategoryRulesDoc(snap.exists ? snap.data() : null)
    cache = { doc, at: Date.now() }
    return doc
  } catch (err) {
    console.warn('[categoryRulesStore] read failed, using fallback:', err)
    return { categories: {}, default: { ...FALLBACK_CATEGORY_RULE } }
  }
}

export async function getRuleForCategory(
  categoryId?: string | null,
): Promise<SocialCategoryRule> {
  const doc = await getCategoryRulesDoc()
  const id = (categoryId ?? '').trim().toLowerCase()
  if (id && doc.categories[id]) return doc.categories[id]
  return doc.default
}
