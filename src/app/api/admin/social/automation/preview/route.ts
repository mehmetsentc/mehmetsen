/**
 * POST /api/admin/social/automation/preview — dry run, NEVER publishes.
 * Evaluates a (possibly unsaved) rule against the latest published news and
 * returns match + Turkish reasons per item. Reads ≤ 80 news documents.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { evaluateRuleConditions, newsFactsFrom, summarizeRule } from '@/lib/social/automation/match'
import { validateRuleInput } from '@/lib/social/automation/types'
import { automationContentProblemWith, CONTENT_PROBLEM_TEXT } from '@/lib/social/automation/worker'
import { extractImageUrl, isOwnContent, isSkippableForSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PREVIEW_LIMIT = 80

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const v = validateRuleInput(await readJsonBody(request))
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const snap = await getAdminFirestore()
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(PREVIEW_LIMIT)
    .get()
  const items = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const facts = newsFactsFrom(d.id, data)
    const ev = evaluateRuleConditions(v.value, facts)
    const problem = automationContentProblemWith(data, { isOwnContent, isSkippableForSocial, extractImageUrl })
    return {
      newsId: d.id,
      title: typeof data.title === 'string' ? data.title.slice(0, 160) : '',
      publishedAt: facts.publishedAt,
      citySlug: facts.citySlug || null,
      categoryId: facts.categoryId || null,
      match: ev.match && !problem,
      conditionsMatch: ev.match,
      reasons: problem ? [...ev.reasons, CONTENT_PROBLEM_TEXT[problem] ?? problem] : ev.reasons,
    }
  })
  return json({
    summary: summarizeRule(v.value),
    scanned: items.length,
    matched: items.filter((i) => i.match).length,
    items,
    note: 'Önizleme yalnızca değerlendirir; paylaşım yapmaz. Kural açıldığında yalnızca açıldıktan SONRA yayımlanan haberler paylaşılır.',
  })
}
