/**
 * Threads Graph API service layer.
 * Two-step publish: (1) create media container, (2) publish container.
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
import { clampAtWordBoundary } from './feedCaption'

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'
const THREADS_CAPTION_LIMIT = 500

// ── Caption builder ────────────────────────────────────────────────────────────

/**
 * Threads caption (max 500 chars):
 *   📰 {başlık}
 *
 *   {kısa açıklama}
 *
 *   {articleUrl}
 *
 *   #tag1 #tag2
 */
function buildThreadsCaption(payload: SocialPublishPayload): string {
  const title = (payload.title ?? '').replace(/\s+/g, ' ').trim()
  const body  = (payload.description ?? '').replace(/\s+/g, ' ').trim()
  const url   = payload.articleUrl?.trim() ?? ''
  const tags  = (payload.hashtags?.length ? payload.hashtags : ['#NaHaber', '#Çanakkale', '#SonDakika'])
    .map(t => (String(t).trim().startsWith('#') ? String(t).trim() : `#${String(t).trim()}`))
    .join(' ')

  const assemble = (t: string, b: string, withTags: boolean): string => {
    const parts: string[] = [`📰 ${t}`]
    if (b) { parts.push(''); parts.push(b) }
    if (url) { parts.push(''); parts.push(url) }
    if (withTags && tags) { parts.push(''); parts.push(tags) }
    return parts.join('\n')
  }

  // 1. Tam metin
  let caption = assemble(title, body, true)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 2. Hashtag'siz
  caption = assemble(title, body, false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 3. Açıklamayı kısalt
  const overhead = assemble(title, '', false).length + (body ? 2 : 0)
  const bodyBudget = Math.max(60, THREADS_CAPTION_LIMIT - overhead - 4)
  const shortBody = clampAtWordBoundary(body, bodyBudget)
  caption = assemble(title, shortBody, false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  // 4. Açıklama yok, başlık kıs
  const urlOverhead = url ? url.length + 2 : 0
  const titleBudget = Math.max(40, THREADS_CAPTION_LIMIT - urlOverhead - 4)
  const shortTitle  = clampAtWordBoundary(title, titleBudget)
  caption = assemble(shortTitle, '', false)
  if (caption.length <= THREADS_CAPTION_LIMIT) return caption

  return clampAtWordBoundary(`📰 ${shortTitle}`, THREADS_CAPTION_LIMIT)
}

// ── API helpers ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Create a Threads media container.
 * Returns the creation_id (container ID).
 */
async function createThreadsContainer(
  userId: string,
  accessToken: string,
  text: string,
  imageUrl?: string,
): Promise<string> {
  const params = new URLSearchParams({
    access_token: accessToken,
    text,
    ...(imageUrl
      ? { media_type: 'IMAGE', image_url: imageUrl }
      : { media_type: 'TEXT' }),
  })

  const res = await fetch(`${THREADS_API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Threads container HTTP ${res.status}`)
  }

  return json.id
}

/**
 * Step 2 — Publish a Threads container.
 * Returns the published Threads media ID.
 */
async function publishThreadsContainer(
  userId: string,
  accessToken: string,
  creationId: string,
): Promise<string> {
  const params = new URLSearchParams({
    access_token: accessToken,
    creation_id: creationId,
  })

  const res = await fetch(`${THREADS_API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Threads publish HTTP ${res.status}`)
  }

  return json.id
}

// ── Ana yayın fonksiyonu ───────────────────────────────────────────────────────

/**
 * Threads'e bir haber paylaşır.
 * Görsel varsa IMAGE post, yoksa TEXT post olarak yayınlar.
 * Threads'te linkler caption içinde tıklanabilir — ayrı link alanı gerekmez.
 */
export async function publishToThreads(
  payload: SocialPublishPayload,
): Promise<SocialPublishResult> {
  const userId      = process.env.THREADS_USER_ID?.trim()
  const accessToken = process.env.THREADS_ACCESS_TOKEN?.trim()

  if (!userId || !accessToken) {
    const missing = [
      !userId      && 'THREADS_USER_ID',
      !accessToken && 'THREADS_ACCESS_TOKEN',
    ].filter(Boolean).join(', ')
    return { success: false, error: `Threads credentials eksik: ${missing}` }
  }

  const caption  = buildThreadsCaption(payload)
  const imageUrl = payload.imageUrl?.trim() || undefined

  try {
    // Step 1: container oluştur
    const creationId = await createThreadsContainer(userId, accessToken, caption, imageUrl)
    console.log(`[threads] Container oluşturuldu — id: ${creationId}`)

    // Step 2: yayınla (Threads, container'ın hazır olması için kısa bekleme önerir)
    await new Promise(r => setTimeout(r, 1500))
    const mediaId = await publishThreadsContainer(userId, accessToken, creationId)
    console.log(`[threads] Post yayınlandı — id: ${mediaId}`)

    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[threads] Hata:', msg)
    return { success: false, error: msg }
  }
}
