/**
 * Threads Graph API service layer.
 * Two-step publish: (1) create media container, (2) poll status, (3) publish.
 *
 * Threads API base: https://graph.threads.net/v1.0/
 *
 * Required env vars (server-side only):
 *   THREADS_USER_ID      — Threads user ID (numeric string)
 *   THREADS_ACCESS_TOKEN — Long-lived user access token with
 *                          threads_basic + threads_content_publish scopes
 *
 * Caption limit: 500 characters.
 * Links in text ARE clickable on Threads (unlike Instagram feed posts).
 *
 * Post types used here:
 *   IMAGE — image_url + text (caption)
 *   TEXT  — text only (fallback when no image)
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { clampAtWordBoundary, clampCompleteHeadline, clampCompleteSentences } from './feedCaption'
import { rewriteForPlatform } from '@/services/metaAiRewriteService'
import { THREADS_GRAPH_BASE } from './graphConfig'
import type { ThreadsPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR, isUsableThreadsTarget } from './accounts/targetGuards'
import { errorLogFields, safeErrorText, socialLog } from './safeLog'
import { withLegacyPublishLock, type LegacyPublishOptions, type LockedPublishResult } from './accounts/legacyLock'
import { singleImageGuard } from './imagePolicy'

const THREADS_API_BASE = THREADS_GRAPH_BASE
/** Meta Threads API: post text max 500 characters (emojis = UTF-8 bytes). */
export const THREADS_CAPTION_LIMIT = 500
const THREADS_CTA = 'Haberin devamını oku'
const CONTAINER_POLL_INTERVAL_MS = 2000
const CONTAINER_POLL_MAX_ATTEMPTS = 15 // 30s max wait

// ── Caption builder ────────────────────────────────────────────────────────────

/**
 * Threads caption (max 500 chars):
 *   📰 {başlık}
 *
 *   {kısa açıklama — cümle sınırında kısaltılır}
 *
 *   Haberin devamını oku
 *   {articleUrl}
 *
 *   #tag1 #tag2
 *
 * CTA + URL için yer bırakılır; gövde asla cümle ortasından kesilmez.
 */
export function buildThreadsCaption(payload: SocialPublishPayload): string {
  const title = (payload.title ?? '').replace(/\s+/g, ' ').trim()
  const body  = (payload.description ?? '').replace(/\s+/g, ' ').trim()
  const url   = payload.articleUrl?.trim() ?? ''
  const tags  = (payload.hashtags?.length ? payload.hashtags : ['#NaHaber', '#Çanakkale', '#SonDakika'])
    .map(t => (String(t).trim().startsWith('#') ? String(t).trim() : `#${String(t).trim()}`))
    .join(' ')

  const linkBlock = url ? `${THREADS_CTA}\n${url}` : ''

  const assemble = (t: string, b: string, withTags: boolean): string => {
    const parts: string[] = [`📰 ${t}`]
    if (b) { parts.push(''); parts.push(b) }
    if (linkBlock) { parts.push(''); parts.push(linkBlock) }
    if (withTags && tags) { parts.push(''); parts.push(tags) }
    return parts.join('\n')
  }

  // 1. Tam metin
  let caption = assemble(title, body, true)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 2. Hashtag'siz — CTA + URL korunsun
  caption = assemble(title, body, false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 3. Açıklamayı tam cümle sınırında kısalt (CTA + URL + manşet sabit)
  const overhead = assemble(title, '', false).length + (body ? 2 : 0)
  const bodyBudget = Math.max(40, THREADS_CAPTION_LIMIT - overhead - 4)
  const shortBody = clampCompleteSentences(body, bodyBudget)
  caption = assemble(title, shortBody, false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 4. Açıklama yok; manşeti mümkünse tam tut, gerekirse kelime sınırında kıs
  const linkOverhead = linkBlock ? linkBlock.length + 2 : 0
  const titleBudget = Math.max(40, THREADS_CAPTION_LIMIT - linkOverhead - 4) // "📰 " + newlines
  const shortTitle = clampCompleteHeadline(title, titleBudget)
  caption = assemble(shortTitle, '', false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // Asla URL/CTA'yı ortadan kesme — limit aşarsa CTA'sız manşet (nadir)
  return clampAtWordBoundary(`📰 ${shortTitle}`, THREADS_CAPTION_LIMIT)
}

// ── Error helpers ──────────────────────────────────────────────────────────────

interface MetaApiError {
  message?: string
  code?: number
  type?: string
  error_subcode?: number
  error_user_msg?: string
  error_user_title?: string
  fbtrace_id?: string
}

/**
 * Code-only description of a Meta error. The platform's own message /
 * error_user_msg is untrusted (may echo tokens or request URLs) and is never
 * included in logs, responses or audit records.
 */
function formatMetaError(err: MetaApiError): string {
  const parts: string[] = []
  if (typeof err.code === 'number') parts.push(`kod ${err.code}`)
  if (typeof err.error_subcode === 'number') parts.push(`alt kod ${err.error_subcode}`)
  if (typeof err.type === 'string' && /^[A-Za-z_]{1,40}$/.test(err.type)) parts.push(`tür ${err.type}`)
  return parts.length ? parts.join(', ') : 'ayrıntı yok'
}

/** Turkish guidance from the error CODE only — message text is not inspected. */
function translateMetaError(err: MetaApiError, op: string): string {
  const code = err.code
  const detail = formatMetaError(err)
  if (code === 190) return `Threads ${op} reddedildi: token geçersiz veya süresi dolmuş — yeniden bağlantı gerekli (${detail})`
  if (code === 4 || code === 17 || code === 613) return `Threads ${op} reddedildi: API hız limiti — birkaç dakika sonra tekrar deneyin (${detail})`
  if (code === 10 || code === 200) return `Threads ${op} reddedildi: izin hatası — threads_content_publish iznini kontrol edin (${detail})`
  if (code === 1) return `Threads ${op} reddedildi: geçici API hatası, genellikle görsel erişimi (${detail})`
  return `Threads ${op} reddedildi (${detail})`
}

/** Raised when the publish call's outcome is unknown (transport failure). */
class ThreadsPublishOutcomeUnknown extends Error {
  constructor(reason: string) {
    super(`Threads yayın isteğinin sonucu alınamadı (network: ${reason}) — platformda kontrol edin`)
    this.name = 'ThreadsPublishOutcomeUnknown'
  }
}

// ── API helpers ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Create a Threads media container.
 * Uses POST body (form-urlencoded) to avoid URL length/encoding issues.
 * Returns the creation_id (container ID).
 */
async function createThreadsContainer(
  userId: string,
  accessToken: string,
  text: string,
  imageUrl?: string,
): Promise<string> {
  const endpoint = `${THREADS_API_BASE}/${userId}/threads`

  const body = new URLSearchParams()
  body.set('access_token', accessToken)
  body.set('text', text)
  body.set('media_type', imageUrl ? 'IMAGE' : 'TEXT')
  if (imageUrl) {
    body.set('image_url', imageUrl)
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const rawText = await res.text()

  let json: { id?: string; error?: MetaApiError } = {}
  try { json = JSON.parse(rawText) } catch { /* ignore */ }

  socialLog('log', 'threads', 'container_create', { status: res.status, ok: res.ok && !!json.id, code: json.error?.code ?? null })

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error ? translateMetaError(json.error, 'kapsayıcı') : `Threads kapsayıcı reddedildi (HTTP ${res.status})`)
  }

  return json.id
}

/**
 * Step 1.5 — Poll container status until FINISHED or ERROR.
 * Meta requires the container to finish processing (especially for IMAGE)
 * before calling threads_publish.
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, CONTAINER_POLL_INTERVAL_MS))

    const url = `${THREADS_API_BASE}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`
    try {
      const res = await fetch(url)
      const json = await res.json() as {
        status?: string
        error_message?: string
        error?: MetaApiError
      }

      const st = typeof json.status === 'string' && /^[A-Z_]{1,20}$/.test(json.status) ? json.status : 'unknown'
      socialLog('log', 'threads', 'container_status', { attempt: attempt + 1, state: st })

      if (json.status === 'FINISHED') return
      if (json.status === 'ERROR' || json.error) {
        // error_message is platform text — not propagated.
        throw new Error(`Threads container işlenemedi (durum ${st}${json.error ? `, ${formatMetaError(json.error)}` : ''})`)
      }
      // IN_PROGRESS or EXPIRED — keep polling for IN_PROGRESS
      if (json.status === 'EXPIRED') {
        throw new Error('Threads container süresi doldu — container 24 saat içinde yayınlanmalı')
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Threads container')) throw err
      socialLog('warn', 'threads', 'container_status_error', { attempt: attempt + 1, ...errorLogFields(err) })
    }
  }
  // Timeout — try publishing anyway (TEXT containers are usually instant)
  socialLog('warn', 'threads', 'container_status_timeout', { result: 'publish_anyway' })
}

/**
 * Step 2 — Publish a Threads container.
 * Uses POST body (form-urlencoded).
 * Returns the published Threads media ID.
 */
async function publishThreadsContainer(
  userId: string,
  accessToken: string,
  creationId: string,
): Promise<string> {
  const endpoint = `${THREADS_API_BASE}/${userId}/threads_publish`

  const body = new URLSearchParams()
  body.set('access_token', accessToken)
  body.set('creation_id', creationId)

  let res: Response
  let rawText: string
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    rawText = await res.text()
  } catch (err) {
    // The platform may have accepted the publish — outcome unknown.
    throw new ThreadsPublishOutcomeUnknown(err instanceof Error ? err.name : 'error')
  }

  let json: { id?: string; error?: MetaApiError } = {}
  try { json = JSON.parse(rawText) } catch { /* ignore */ }

  socialLog('log', 'threads', 'publish', { status: res.status, ok: res.ok && !!json.id, code: json.error?.code ?? null })

  if (res.ok && !json.error && !json.id) {
    // 2xx without an id: may have been published.
    throw new ThreadsPublishOutcomeUnknown('no_id')
  }
  if (res.status >= 500 || json.error?.code === 1 || json.error?.code === 2) {
    // Server-side / unknown Meta error on publish: the post may still be live.
    throw new ThreadsPublishOutcomeUnknown('server_error')
  }
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error ? translateMetaError(json.error, 'yayınlama') : `Threads yayınlama reddedildi (HTTP ${res.status})`)
  }

  return json.id
}

// ── Full pipeline helper ────────────────────────────────────────────────────────

/**
 * Runs the complete create → poll → publish pipeline for a single attempt.
 * Returns the published media ID on success, throws on any failure.
 */
async function runThreadsPipeline(
  userId: string,
  accessToken: string,
  caption: string,
  imageUrl: string | undefined,
): Promise<string> {
  const mediaType = imageUrl ? 'IMAGE' : 'TEXT'
  const creationId = await createThreadsContainer(userId, accessToken, caption, imageUrl)
  socialLog('log', 'threads', 'container_created', { mediaType })

  await waitForContainerReady(creationId, accessToken)

  const mediaId = await publishThreadsContainer(userId, accessToken, creationId)
  socialLog('log', 'threads', 'published', { mediaType, mediaId })
  return mediaId
}

// ── Ana yayın fonksiyonu ───────────────────────────────────────────────────────

/**
 * Threads'e bir haber paylaşır.
 * Görsel varsa IMAGE post yapılır; görselli yayın başarısız olursa sessizce
 * metin gönderisine DÜŞÜLMEZ (Görev 6): açık hata döner, yayın sonucu
 * bilinmiyorsa belirsiz (uncertain) olarak bildirilir.
 * Görsel yoksa (açık metin yayını) TEXT post yapılır — eski davranış.
 * Threads'te linkler caption içinde tıklanabilir — ayrı link alanı gerekmez.
 */
async function publishToThreadsUnlocked(
  payload: SocialPublishPayload,
  /** Optional explicit account. Omitted → legacy THREADS_* env credentials (unchanged). */
  target?: ThreadsPublishTarget,
): Promise<SocialPublishResult> {
  if (target !== undefined && !isUsableThreadsTarget(target)) {
    socialLog('error', 'threads', 'invalid_target', { newsId: payload.newsId })
    return { success: false, error: INVALID_TARGET_ERROR }
  }
  if (target) {
    socialLog('log', 'threads', 'target', { account: target.accountId, method: target.connectionMethod })
  }
  const userId      = target ? target.threadsUserId : process.env.THREADS_USER_ID?.trim()
  const accessToken = target ? target.accessToken : process.env.THREADS_ACCESS_TOKEN?.trim()

  if (!userId || !accessToken) {
    const missing = [
      !userId      && 'THREADS_USER_ID',
      !accessToken && 'THREADS_ACCESS_TOKEN',
    ].filter(Boolean).join(', ')
    return { success: false, error: `Threads credentials eksik: ${missing}` }
  }

  // Meta AI: özgün gövde (500 limit buildThreadsCaption içinde korunur). Fail → yerel.
  let captionPayload = payload
  const city = payload.cityName?.trim() || 'Çanakkale'
  const contentForAi = (payload.description ?? '').trim() || payload.title
  const ai = await rewriteForPlatform(payload.title, contentForAi, city, 'threads', {
    articleUrl: payload.articleUrl,
    newsId: payload.newsId,
  })
  if (ai.enabled) {
    const tags =
      ai.hashtags.length > 0
        ? ai.hashtags
        : payload.hashtags
    captionPayload = { ...payload, description: ai.caption, hashtags: tags }
  }

  const caption  = buildThreadsCaption(captionPayload)
  const imageUrl = payload.imageUrl?.trim() || undefined

  try {
    // IMAGE pipeline: create → poll → publish (full pipeline try/catch)
    if (imageUrl) {
      try {
        const mediaId = await runThreadsPipeline(userId, accessToken, caption, imageUrl)
        return { success: true, platformId: mediaId }
      } catch (imgErr) {
        // Publish outcome unknown → surfaced as uncertain by the caller's ledger.
        if (imgErr instanceof ThreadsPublishOutcomeUnknown) throw imgErr
        socialLog('warn', 'threads', 'image_pipeline_failed', { newsId: payload.newsId, result: 'no_text_fallback', ...errorLogFields(imgErr) })
        return {
          success: false,
          code: 'image_publish_failed',
          error: `Threads görselli gönderi yayımlanamadı; metin gönderisine düşürülmedi — ${safeErrorText(imgErr)}`,
        }
      }
    }

    // TEXT pipeline: explicit text publish (no image in the request)
    const mediaId = await runThreadsPipeline(userId, accessToken, caption, undefined)
    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = safeErrorText(err)
    socialLog('error', 'threads', 'publish_failed', { newsId: payload.newsId, ...errorLogFields(err) })
    return { success: false, error: msg }
  }
}

// ── Shared publish lock (legacy path) ──────────────────────────────────────────

/**
 * publishToThreads — explicit target: the caller (publishToTarget) already holds the
 * account-scoped ledger claim. No target: legacy Onyeditivi credentials,
 * guarded by the shared ledger lock (see accounts/legacyLock.ts).
 */
export async function publishToThreads(
  payload: SocialPublishPayload,
  target?: ThreadsPublishTarget,
  legacy?: LegacyPublishOptions,
): Promise<LockedPublishResult> {
  // Tek görsel uygulanır: kaydırmalı istek ya da açık 'single' seçimi olmayan
  // çoklu görsel, medya hazırlığı/kilit/platform isteğinden ÖNCE reddedilir —
  // sessizce ilk görsele düşürülmez (bkz. imagePolicy.ts).
  const imageBlock = singleImageGuard(payload, 'threads')
  if (imageBlock) return imageBlock
  if (target !== undefined) return publishToThreadsUnlocked(payload, target)
  return withLegacyPublishLock(
    { platform: 'threads', format: 'post', newsId: payload.newsId, options: legacy },
    () => publishToThreadsUnlocked(payload),
  )
}
