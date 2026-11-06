/**
 * TIKTOK-1 — server side of the TikTok post dialog (manual, editor-approved).
 *
 *   tiktokAccountsFor(actor, newsId)    → TikTok accounts the editor may post this story to
 *   tiktokCreatorInfoFor(actor, id)     → live creator info (nickname, privacy options, limits)
 *   publishTikTokForNews(actor, input)  → ONE post through the shared publish ledger
 *   tiktokPostStatusFor(actor, id, pid) → TikTok processing status of an earlier post
 *
 * Rules:
 *   - the actor must be allowed to publish to the account (canPublishToAccount)
 *     and the account must be active
 *   - a province account takes only stories of its own province
 *   - the video is the saved NaHaber reel of the story (reelVideos/{newsId});
 *     nothing is rendered here
 *   - the ledger (claimPublish / finishPublish, format `reel`) makes the post
 *     unique per story + account and turns a lost answer into «uncertain»
 *   - nothing is sent without the editor's explicit settings + consent
 *     (validated again against fresh creator info in publishTikTokVideo)
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { canPublishToAccount, type SocialActor } from './accounts/access'
import { writeSocialAudit } from './accounts/audit'
import { isWellFormedAccountId, loadSocialAccount } from './accounts/accountStore'
import { listAccountsForActor } from './accounts/connect/flows'
import { CLAIM_TEXT, UNCERTAIN_TEXT, classifyOutcome, claimPublish, finishPublish } from './accounts/publishLedger'
import { resolvePublishTarget } from './accounts/resolvePublishTarget'
import { markTokenRejected } from './accounts/connectionCheck'
import { ownershipKind, type SocialAccount } from './accounts/types'
import type { TikTokPublishTarget } from './accounts/targetTypes'
import { queryTikTokCreatorInfo, isTikTokPrivacyLevel, type TikTokCreatorInfo } from './accounts/connect/tiktokOAuth'
import { fetchTikTokPostStatus, publishTikTokVideo, tiktokText, TIKTOK_FAIL_REASON_TEXT, type TikTokPostSettings } from './tiktokPublish'
import { REEL_VIDEOS } from '@/lib/reels/reelLibrary'
import { provinceOf } from './automation/types'
import { buildReelCaption } from './reelPublish'
import { buildPublicArticleUrl } from './articleUrl'
import { withSocialUtm } from './utm'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export interface TikTokAccountOption {
  accountId: string
  displayName: string
  selectable: boolean
  reason: string | null
}

async function loadNews(newsId: string): Promise<Record<string, unknown> | null> {
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  return snap.exists ? (snap.data() as Record<string, unknown>) : null
}

async function loadSavedReel(newsId: string): Promise<{ url: string; seconds: number | null } | null> {
  const snap = await getAdminFirestore().collection(REEL_VIDEOS).doc(newsId).get()
  if (!snap.exists) return null
  const d = snap.data() as Record<string, unknown>
  const url = str(d.url)
  if (!url) return null
  return { url, seconds: typeof d.seconds === 'number' && d.seconds > 0 ? d.seconds : null }
}

/** Why this account can't take this story (null = it can). */
function accountProblem(actor: SocialActor, a: SocialAccount, news: Record<string, unknown>): string | null {
  if (a.platform !== 'tiktok') return 'TikTok hesabı değil'
  if (!canPublishToAccount(actor, a.ownership)) return 'Bu hesaba paylaşım yetkiniz yok'
  if (a.status !== 'active') return a.status === 'needs_reauth' ? 'Hesap yeniden bağlanmalı' : a.status === 'paused' ? 'Hesap duraklatılmış' : 'Hesap kullanılamıyor'
  if (ownershipKind(a.ownership) === 'province') {
    const city = provinceOf(str(news.citySlug))
    if (!city) return 'Haberin ili belli değil; il hesabına paylaşılamaz'
    if (city !== a.ownership.citySlug) return 'Haber bu hesabın ilinde değil'
  }
  return null
}

export async function tiktokAccountsFor(actor: SocialActor, newsId: string): Promise<{ ok: true; accounts: TikTokAccountOption[]; hasVideo: boolean } | { ok: false; status: number; code: string }> {
  const news = await loadNews(newsId)
  if (!news) return { ok: false, status: 404, code: 'news_not_found' }
  if (str(news.status) !== 'published') return { ok: false, status: 409, code: 'news_not_published' }
  const [accounts, reel] = await Promise.all([listAccountsForActor(actor), loadSavedReel(newsId)])
  return {
    ok: true,
    hasVideo: !!reel,
    accounts: accounts
      .filter((a) => a.platform === 'tiktok')
      .map((a) => {
        const reason = accountProblem(actor, a, news)
        return { accountId: a.id, displayName: a.displayName, selectable: !reason, reason }
      }),
  }
}

async function tiktokTarget(actor: SocialActor, accountId: string): Promise<{ ok: true; account: SocialAccount; target: TikTokPublishTarget } | { ok: false; status: number; code: string; error: string }> {
  if (!isWellFormedAccountId(accountId)) return { ok: false, status: 400, code: 'invalid_account_id', error: 'Hesap geçersiz' }
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok' || loaded.account.platform !== 'tiktok') return { ok: false, status: 404, code: 'not_found', error: 'TikTok hesabı bulunamadı' }
  if (!canPublishToAccount(actor, loaded.account.ownership)) return { ok: false, status: 403, code: 'forbidden', error: 'Bu hesaba paylaşım yetkiniz yok' }
  const r = await resolvePublishTarget(accountId, { expectedPlatform: 'tiktok' })
  if (!r.ok) return { ok: false, status: 409, code: r.code, error: r.message }
  return { ok: true, account: loaded.account, target: r.target as TikTokPublishTarget }
}

/** Live creator info for the dialog. Shown fresh every time the dialog opens (TikTok guideline). */
export async function tiktokCreatorInfoFor(actor: SocialActor, accountId: string): Promise<{ ok: true; info: TikTokCreatorInfo } | { ok: false; status: number; code: string; error: string }> {
  const t = await tiktokTarget(actor, accountId)
  if (!t.ok) return t
  const ci = await queryTikTokCreatorInfo(t.target.accessToken)
  if (!ci.ok) {
    if (ci.code === 'access_token_invalid') {
      await markTokenRejected(accountId, { by: actor.uid, now: Date.now(), source: 'creator_info:tiktok', code: 401, subcode: null }).catch(() => undefined)
    }
    return { ok: false, status: 409, code: ci.code, error: tiktokText(ci.code, 'TikTok hesap bilgisi alınamadı') }
  }
  return { ok: true, info: ci.info }
}

/** Default caption for the dialog (editable there): the reel caption, TikTok length. */
export async function tiktokDefaultTitle(newsId: string, accountId: string): Promise<string> {
  const d = await loadNews(newsId)
  if (!d) return ''
  const articleUrl = withSocialUtm(buildPublicArticleUrl(newsId, d), { platform: 'tiktok', format: 'reel', accountId }) ?? null
  return buildReelCaption(d, articleUrl)
}

/** Parse the dialog's settings. Nothing is defaulted: missing / wrong types → null. */
export function parseTikTokSettings(raw: unknown): TikTokPostSettings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const bool = (v: unknown) => v === true
  const mode = r.mode === 'inbox' ? 'inbox' : r.mode === 'direct' ? 'direct' : null
  if (!mode) return null
  const privacyLevel = isTikTokPrivacyLevel(r.privacyLevel) ? r.privacyLevel : null
  if (typeof r.title !== 'string') return null
  return {
    mode,
    privacyLevel,
    allowComment: bool(r.allowComment),
    allowDuet: bool(r.allowDuet),
    allowStitch: bool(r.allowStitch),
    commercial: bool(r.commercial),
    yourBrand: bool(r.yourBrand),
    brandedContent: bool(r.brandedContent),
    aiGenerated: bool(r.aiGenerated),
    title: r.title,
    consent: bool(r.consent),
  }
}

export interface TikTokPublishResponse {
  success: boolean
  code: string
  ledgerStatus: string
  error?: string
  publishId?: string
  tiktokStatus?: string | null
}

export async function publishTikTokForNews(
  actor: SocialActor,
  input: { newsId: string; accountId: string; settings: TikTokPostSettings; force?: boolean },
): Promise<TikTokPublishResponse> {
  const news = await loadNews(input.newsId)
  if (!news || str(news.status) !== 'published') return { success: false, code: 'news_not_published', ledgerStatus: 'not_claimed', error: 'Haber yayında değil' }
  const loaded = await loadSocialAccount(input.accountId)
  if (loaded.state !== 'ok') return { success: false, code: 'not_found', ledgerStatus: 'not_claimed', error: 'TikTok hesabı bulunamadı' }
  const problem = accountProblem(actor, loaded.account, news)
  if (problem) return { success: false, code: 'not_allowed', ledgerStatus: 'not_claimed', error: problem }
  const reel = await loadSavedReel(input.newsId)
  if (!reel) return { success: false, code: 'no_video', ledgerStatus: 'not_claimed', error: 'Bu haberin kayıtlı videosu yok; önce Reels stüdyosunda video oluşturun' }
  if (!input.settings.consent) return { success: false, code: 'no_consent', ledgerStatus: 'not_claimed', error: 'TikTok müzik kullanım onayı işaretlenmedi' }

  const now = Date.now()
  const claim = await claimPublish({
    newsId: input.newsId,
    accountId: input.accountId,
    platform: 'tiktok',
    format: 'reel',
    force: input.force === true,
    actorUid: actor.uid,
    trigger: 'tiktok_dialog',
    now,
  })
  if (!claim.ok) {
    return { success: false, code: claim.code, ledgerStatus: 'not_claimed', error: CLAIM_TEXT[claim.code], ...(claim.externalPostId ? { publishId: claim.externalPostId } : {}) }
  }

  const resolved = await resolvePublishTarget(input.accountId, { expectedPlatform: 'tiktok', now: Date.now() })
  if (!resolved.ok) {
    await finishPublish({ recordId: claim.recordId, attemptId: claim.attemptId, status: 'failed', externalPostId: null, errorCode: resolved.code, actorUid: actor.uid, now: Date.now() })
    return { success: false, code: resolved.code, ledgerStatus: 'failed', error: resolved.message }
  }

  let result: Awaited<ReturnType<typeof publishTikTokVideo>> | null = null
  let threw = false
  try {
    // Short poll only (Cloudflare 100 s limit); the dialog keeps polling ?publishId=.
    result = await publishTikTokVideo({ newsId: input.newsId, videoUrl: reel.url, seconds: reel.seconds, settings: input.settings }, resolved.target as TikTokPublishTarget, { pollTimes: 4, pollMs: 5000 })
  } catch {
    threw = true
  }
  const outcome = classifyOutcome(result, threw)
  const publishId = outcome.status === 'succeeded' ? (result?.platformId ?? null) : null
  await finishPublish({
    recordId: claim.recordId,
    attemptId: claim.attemptId,
    status: outcome.status,
    externalPostId: publishId,
    errorCode: outcome.status === 'succeeded' ? null : outcome.code,
    actorUid: actor.uid,
    now: Date.now(),
  }).catch(() => false)
  await writeSocialAudit({
    actorId: actor.uid,
    action: 'social.publish.share',
    entityType: 'news',
    entityId: input.newsId,
    meta: {
      platform: 'tiktok',
      accountId: input.accountId,
      mode: input.settings.mode,
      privacy: input.settings.privacyLevel,
      commercial: input.settings.commercial,
      result: outcome.status,
      tiktokStatus: result?.tiktokStatus ?? null,
    },
  })
  return {
    success: outcome.status === 'succeeded',
    code: outcome.code,
    ledgerStatus: outcome.status,
    ...(publishId ? { publishId, tiktokStatus: result?.tiktokStatus ?? null } : {}),
    ...(outcome.status === 'succeeded' ? {} : { error: outcome.status === 'uncertain' ? UNCERTAIN_TEXT : (result?.error ?? 'TikTok paylaşımı başarısız') }),
  }
}

export async function tiktokPostStatusFor(
  actor: SocialActor,
  accountId: string,
  publishId: string,
): Promise<{ ok: true; status: string | null; text: string; postIds: string[] } | { ok: false; status: number; code: string; error: string }> {
  if (!/^[0-9A-Za-z_.~-]{4,64}$/.test(publishId)) return { ok: false, status: 400, code: 'invalid_publish_id', error: 'Geçersiz paylaşım kimliği' }
  const t = await tiktokTarget(actor, accountId)
  if (!t.ok) return t
  const st = await fetchTikTokPostStatus(t.target.accessToken, publishId)
  if ('error' in st) return { ok: false, status: 502, code: st.error, error: tiktokText(st.error, 'TikTok durumu alınamadı') }
  const text =
    st.status === 'PUBLISH_COMPLETE'
      ? 'TikTok’ta yayımlandı'
      : st.status === 'SEND_TO_USER_INBOX'
        ? 'TikTok gelen kutusuna taslak olarak gönderildi; hesap sahibi TikTok uygulamasından tamamlamalı'
        : st.status === 'FAILED'
          ? (st.failReason && TIKTOK_FAIL_REASON_TEXT[st.failReason]) || 'TikTok videoyu işleyemedi'
          : 'TikTok videoyu işliyor; profilde görünmesi birkaç dakika sürebilir'
  return { ok: true, status: st.status, text, postIds: st.postIds }
}
