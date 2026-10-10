/**
 * GET  /api/admin/social/automation/rules — rules (+ summaries), target accounts,
 *       legacy handoffs, today's counters, reconcile state.
 * POST /api/admin/social/automation/rules — create a rule (always DISABLED).
 *
 * Auth (this phase): central social-account managers only (system:settings,
 * unscoped) — the same guard as account management. Ownership, platform and
 * enabled state are never taken from the client.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listManagedAccounts } from '@/lib/social/accounts/connect/flows'
import { legacyAccountId } from '@/lib/social/accounts/legacyLock'
import { toPublicSocialAccount } from '@/lib/social/accounts/types'
import { readCounters, istanbulParts } from '@/lib/social/automation/limits'
import { summarizeRule } from '@/lib/social/automation/match'
import { readReconcileState } from '@/lib/social/automation/reconcile'
import { createRule, listRules, readLegacyHandoffs } from '@/lib/social/automation/ruleStore'
import { validateRuleInput } from '@/lib/social/automation/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const now = Date.now()
  const [rules, accounts, handoffs, reconcileState, legacyFb, legacyIg, legacyTh] = await Promise.all([
    listRules(),
    listManagedAccounts(auth.ctx).then((a) => a ?? []),
    readLegacyHandoffs(),
    readReconcileState(),
    legacyAccountId('facebook'),
    legacyAccountId('instagram'),
    legacyAccountId('threads'),
  ])
  const counters = await readCounters([...new Set(rules.map((r) => r.accountId))])
  const today = istanbulParts(now).day
  return json({
    rules: rules
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => ({ ...r, summary: summarizeRule(r) })),
    accounts: accounts.map(toPublicSocialAccount),
    legacyAccountIds: { facebook: legacyFb, instagram: legacyIg, threads: legacyTh },
    handoffs,
    counters: Object.fromEntries(
      Object.entries(counters).map(([id, c]) => [id, { today: c.day === today ? c.count : 0, lastSentAt: c.lastSentAt }]),
    ),
    reconcile: { cursor: reconcileState.cursor, updatedAt: reconcileState.updatedAt || null },
  })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const v = validateRuleInput(await readJsonBody(request))
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const r = await createRule(v.value, auth.ctx.uid, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ rule: { ...r.rule, summary: summarizeRule(r.rule) } }, 201)
}
