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
import { clampAtWordBoundary } from './feedCaption'

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'
const THREADS_CAPTION_LIMIT = 500
const CONTAINER_POLL_INTERVAL_MS = 2000
const CONTAINER_POLL_MAX_ATTEMPTS = 15 // 30s max wait

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

// ── Error helpers ──────────────────────────────────────────────────────────────

interface MetaApiError {
  message?: string
  code?: number
  type?: string
  error_subcode?: number
  fbtrace_id?: string
}

function formatMetaError(err: MetaApiError): string {
  const parts: string[] = []
  const msg = err.message || 'Bilinmeyen Meta API hatası'
  parts.push(msg)
  if (err.code != null) parts.push(`code=${err.code}`)
  if (err.type) parts.push(`type=${err.type}`)
  if (err.error_subcode) parts.push(`subcode=${err.error_subcode}`)
  return parts.join(', ')
}

function translateMetaError(err: MetaApiError): string {
  const code = err.code
  const msg = err.message?.toLowerCase() ?? ''

  if (code === 190 || msg.includes('expired') || msg.includes('invalid')) {
    return `Threads token geçersiz veya süresi dolmuş — yeniden bağlantı gerekli (${formatMetaError(err)})`
  }
  if (code === 4 || code === 17 || msg.includes('rate limit') || msg.includes('too many')) {
    return `Threads API hız limiti aşıldı — birkaç dakika sonra tekrar deneyin (${formatMetaError(err)})`
  }
  if (code === 10 || msg.includes('permission') || msg.includes('scope')) {
    return `Threads izin hatası — threads_content_publish scope kontrol edin (${formatMetaError(err)})`
  }
  if (msg.includes('media') && (msg.includes('not found') || msg.includes('fetch'))) {
    return `Threads görsel URL'ye erişemedi — görselin herkese açık olduğundan emin olun (${formatMetaError(err)})`
  }
  if (code === 1) {
    return `Threads API geçici hata — genellikle görsel erişim veya token sorunu (${formatMetaError(err)})`
  }
  return formatMetaError(err)
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

  console.log(`[threads] container response (${res.status}):`, rawText.slice(0, 400))

  if (!res.ok || json.error || !json.id) {
    const detail = json.error
      ? translateMetaError(json.error)
      : `HTTP ${res.status}: ${rawText.slice(0, 200)}`
    throw new Error(detail)
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

      console.log(`[threads] container status (attempt ${attempt + 1}):`, json.status ?? 'unknown')

      if (json.status === 'FINISHED') return
      if (json.status === 'ERROR' || json.error) {
        const errMsg = json.error_message || json.error?.message || 'Container işleme başarısız'
        throw new Error(`Threads container hatası: ${errMsg}`)
      }
      // IN_PROGRESS or EXPIRED — keep polling for IN_PROGRESS
      if (json.status === 'EXPIRED') {
        throw new Error('Threads container süresi doldu — container 24 saat içinde yayınlanmalı')
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Threads container')) throw err
      console.warn(`[threads] status poll error (attempt ${attempt + 1}):`, err)
    }
  }
  // Timeout — try publishing anyway (TEXT containers are usually instant)
  console.warn(`[threads] container status poll timed out, attempting publish anyway`)
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

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const rawText = await res.text()

  let json: { id?: string; error?: MetaApiError } = {}
  try { json = JSON.parse(rawText) } catch { /* ignore */ }

  console.log(`[threads] publish response (${res.status}):`, rawText.slice(0, 400))

  if (!res.ok || json.error || !json.id) {
    const detail = json.error
      ? translateMetaError(json.error)
      : `HTTP ${res.status}: ${rawText.slice(0, 200)}`
    throw new Error(detail)
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
    // Step 1: container oluştur (IMAGE → TEXT fallback)
    let creationId: string
    let usedImage = false
    try {
      creationId = await createThreadsContainer(userId, accessToken, caption, imageUrl)
      usedImage = !!imageUrl
      console.log(`[threads] Container oluşturuldu (${usedImage ? 'IMAGE' : 'TEXT'}) — id: ${creationId}`)
    } catch (imgErr) {
      if (imageUrl) {
        const imgMsg = imgErr instanceof Error ? imgErr.message : String(imgErr)
        console.warn(`[threads] IMAGE container başarısız (${imgMsg}), TEXT post deneniyor`)
        creationId = await createThreadsContainer(userId, accessToken, caption, undefined)
        console.log(`[threads] TEXT container oluşturuldu — id: ${creationId}`)
      } else {
        throw imgErr
      }
    }

    // Step 1.5: Container'ın hazır olmasını bekle (IMAGE için kritik)
    await waitForContainerReady(creationId, accessToken)

    // Step 2: yayınla
    const mediaId = await publishThreadsContainer(userId, accessToken, creationId)
    console.log(`[threads] Post yayınlandı — id: ${mediaId}`)

    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[threads] Hata:', msg)
    return { success: false, error: msg }
  }
}
