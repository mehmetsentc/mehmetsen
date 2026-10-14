import 'server-only'

/**
 * REELS-6 — Post / image-story card in the NaHaber «Bülten» theme (same look as the
 * reels): photo on top, red category band, white panel with a left-aligned headline.
 * Used by materializeBrandedOgForPublish before the legacy OG compositor; any failure
 * (assets not traced, render error, upload error) returns null and the legacy path runs.
 * Switch: studio setting postTheme ('nahaber' default | 'onyeditivi'), env SOCIAL_POST_THEME.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { safeErrorText } from './safeLog'
import { uploadSocialImage } from './storageUploader'

const MAX_IMG = 25 * 1024 * 1024

function assetsReady(root: string): boolean {
  const a = path.join(root, 'src/lib/reels/assets')
  return ['fonts/Inter-ExtraBold.ttf', 'fonts/Inter-Medium.ttf', 'brand/logo-tile.png', 'brand/logo-mark.png'].every((f) => existsSync(path.join(a, f)))
}

export async function postThemeIsNahaber(): Promise<boolean> {
  const env = (process.env.SOCIAL_POST_THEME ?? '').trim().toLowerCase()
  if (env === 'onyeditivi' || env === 'legacy') return false
  if (env === 'nahaber') return true
  try {
    const { getReelVoiceSettings } = await import('@/lib/reels/voiceSettings')
    return (await getReelVoiceSettings()).postTheme !== 'onyeditivi'
  } catch {
    return true
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!/^https:\/\//.test(url) || /\/api\/og\//.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const b = Buffer.from(await res.arrayBuffer())
    return b.length > 1024 && b.length < MAX_IMG ? b : null
  } catch {
    return null
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function nahaberThemeCard(
  newsId: string,
  imageUrl: string,
  kind: 'post' | 'story',
  context?: { title?: string; summary?: string; categoryId?: string; isBreaking?: boolean },
): Promise<string | null> {
  const root = process.cwd()
  if (!assetsReady(root)) return null
  if (!(await postThemeIsNahaber())) return null
  try {
    let d: Record<string, unknown> = {}
    try {
      const { getAdminFirestore } = await import('@/lib/firebase/admin')
      const { Collections } = await import('@/lib/firebase/collections')
      const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
      if (snap.exists) d = snap.data() as Record<string, unknown>
    } catch {
      // context only
    }
    const headline = str(context?.title) || str(d.socialHeadline) || str(d.title)
    if (!headline) return null
    const categoryId = str(context?.categoryId) || str(d.categoryId) || 'gundem'
    const { getCategoryLabel } = await import('@/lib/newsMapper')
    const { renderBulletinCard } = await import('@/lib/reels/bulletinCard')
    const breaking = context?.isBreaking ?? (d.isBreaking === true || categoryId === 'son-dakika')
    const jpg = await renderBulletinCard(
      {
        headline,
        summary: str(context?.summary) || str(d.socialStorySummary) || str(d.summary) || str(d.spot) || null,
        category: getCategoryLabel(categoryId),
        place: str(d.city) || null,
        breaking,
        image: await fetchImage(imageUrl),
        dateLabel: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }),
      },
      kind,
      { root },
    )
    const url = await uploadSocialImage(jpg, newsId, `${newsId}-nh-${kind}.jpg`)
    if (url) console.log(`[nahaberCard] ${kind} card uploaded — ${newsId}`)
    return url
  } catch (err) {
    console.warn(`[nahaberCard] ${kind} card failed — ${newsId}:`, safeErrorText(err))
    return null
  }
}
