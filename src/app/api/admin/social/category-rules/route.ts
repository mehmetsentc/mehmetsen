/**
 * GET  /api/admin/social/category-rules — kategori kurallarını döner
 * PUT  /api/admin/social/category-rules — kategorileri günceller
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  normalizeCategoryRule,
  normalizeCategoryRulesDoc,
  isValidCategoryMode,
  FALLBACK_CATEGORY_RULE,
  type SocialCategoryRule,
  type SocialCategoryMode,
} from '@/lib/social/categoryRules'
import { invalidateCategoryRulesCache } from '@/lib/social/categoryRulesStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC = { collection: 'config', id: 'socialCategoryRules' } as const

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()
  const snap = await db.collection(DOC.collection).doc(DOC.id).get()
  const doc = normalizeCategoryRulesDoc(snap.exists ? snap.data() : null)

  return NextResponse.json({
    categories: doc.categories,
    default: doc.default,
    updatedAt: doc.updatedAt ?? null,
    updatedBy: doc.updatedBy ?? null,
  })
}

export async function PUT(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }

  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const defaultRule = normalizeCategoryRule(b.default, FALLBACK_CATEGORY_RULE)

  const categoriesIn =
    b.categories && typeof b.categories === 'object'
      ? (b.categories as Record<string, unknown>)
      : {}

  const categories: Record<string, SocialCategoryRule> = {}
  for (const [rawId, rawRule] of Object.entries(categoriesIn)) {
    const id = rawId.trim().toLowerCase()
    if (!id) continue
    const rule = normalizeCategoryRule(rawRule, defaultRule)
    if (!isValidCategoryMode(rule.defaultMode)) {
      return NextResponse.json(
        { error: `Geçersiz defaultMode: ${String((rawRule as { defaultMode?: string })?.defaultMode)}` },
        { status: 400 },
      )
    }
    categories[id] = rule
  }

  // Boş kategori map'i + default kaydetmeye izin ver
  const payload = {
    categories,
    default: {
      defaultMode: defaultRule.defaultMode as SocialCategoryMode,
      autoPost: defaultRule.autoPost !== false,
      autoStory: defaultRule.autoStory === true,
      ...(defaultRule.platforms ? { platforms: defaultRule.platforms } : {}),
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: auth.uid,
  }

  const db = getAdminFirestore()
  await db.collection(DOC.collection).doc(DOC.id).set(payload, { merge: true })
  invalidateCategoryRulesCache()

  return NextResponse.json({
    ok: true,
    categories: payload.categories,
    default: payload.default,
    message: 'Kategori kuralları kaydedildi',
  })
}
