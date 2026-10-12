/**
 * Manual share response shaping (server). Adds the target account's display
 * name to each platform result and an overall outcome, so the panel can show
 * «hesap · biçim · durum · gönderi kimliği» per platform. No tokens, no raw
 * platform text.
 */
import type { PublishOneSocialResult } from './publishOneSocial'
import type { SocialPublishResult } from './types'

type Loader = (id: string) => Promise<{ state: string; account?: { displayName: string; username: string | null } }>

export type ShareOutcome = 'published' | 'partial' | 'failed' | 'uncertain' | 'skipped'

const attempted = (r?: SocialPublishResult) => !!r && r.error !== 'skipped'

function platformResults(r: PublishOneSocialResult): SocialPublishResult[] {
  const out: SocialPublishResult[] = []
  for (const set of [r.post, r.story]) {
    if (!set) continue
    for (const k of ['facebook', 'instagram', 'threads', 'twitter'] as const) {
      const v = (set as unknown as Record<string, SocialPublishResult | undefined>)[k]
      if (attempted(v)) out.push(v!)
    }
  }
  return out
}

export function shareOutcome(results: PublishOneSocialResult[]): ShareOutcome {
  if (results.length > 0 && results.every((r) => r.skipped)) return 'skipped'
  const all = results.flatMap(platformResults)
  if (all.length === 0) return 'failed'
  const ok = all.filter((x) => x.success || x.code === 'already_published').length
  if (all.some((x) => x.ledgerStatus === 'uncertain' || x.code === 'uncertain_previous_attempt')) return 'uncertain'
  if (ok === all.length) return 'published'
  return ok > 0 ? 'partial' : 'failed'
}

export async function attachAccountNames(results: PublishOneSocialResult[], load: Loader): Promise<PublishOneSocialResult[]> {
  const ids = new Set<string>()
  for (const r of results) for (const p of platformResults(r)) if (p.accountId) ids.add(p.accountId)
  const names = new Map<string, string>()
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const l = await load(id)
        if (l.state === 'ok' && l.account) names.set(id, l.account.username ? `${l.account.displayName} (@${l.account.username})` : l.account.displayName)
      } catch {
        /* name is cosmetic */
      }
    }),
  )
  const name = (v?: SocialPublishResult) => (v && v.accountId && names.has(v.accountId) ? { ...v, accountName: names.get(v.accountId) } : v)
  return results.map((r) => ({
    ...r,
    ...(r.post ? { post: { ...r.post, facebook: name(r.post.facebook)!, instagram: name(r.post.instagram)!, threads: name(r.post.threads), twitter: name(r.post.twitter) } } : {}),
    ...(r.story ? { story: { ...r.story, facebook: name(r.story.facebook)!, instagram: name(r.story.instagram)! } } : {}),
  }))
}

/** One row per target account and format (Görev 18 EK) — never collapsed per platform. */
export interface TargetResultRow {
  platform: 'facebook' | 'instagram' | 'threads'
  accountId: string
  accountName: string | null
  format: 'post' | 'story'
  success: boolean
  code: string | null
  error: string | null
  ledgerStatus: string | null
  externalPostId: string | null
}

export function targetResultRows(results: PublishOneSocialResult[]): TargetResultRow[] {
  const rows: TargetResultRow[] = []
  const seen = new Set<string>()
  for (const r of results) {
    for (const [format, set] of [['post', r.post], ['story', r.story]] as const) {
      if (!set) continue
      for (const platform of ['facebook', 'instagram', 'threads'] as const) {
        const v = (set as unknown as Record<string, (SocialPublishResult & { code?: string; ledgerStatus?: string }) | undefined>)[platform]
        if (!v || !v.accountId || v.error === 'skipped') continue
        const key = `${v.accountId}__${format}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({
          platform,
          accountId: v.accountId,
          accountName: v.accountName ?? null,
          format,
          success: v.success,
          code: v.code ?? null,
          error: v.success ? null : (v.error ?? null),
          ledgerStatus: v.ledgerStatus ?? null,
          externalPostId: v.platformId ?? null,
        })
      }
    }
  }
  return rows
}
