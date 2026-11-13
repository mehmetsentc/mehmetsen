import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildPostMetadata } from '@/lib/seo'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import {
  canResolveArticleDetail,
  classifyPublicRead,
  publicReadMetaFromPost,
  robotsForPublicReadClass,
} from '@/services/editorial/publicReadPolicy'
import { listReels, REEL_VIDEOS, type ReelRecord } from '@/lib/reels/reelLibrary'
import type { Post } from '@/types/post'

/** Same robots decision as the article page (read policy + AI quality gate). */
export function articleRobots(post: Post): { resolvable: boolean; index: boolean; follow: boolean } {
  if (!isPubliclyVisibleStatus(post.status)) return { resolvable: false, index: false, follow: false }
  const readClass = classifyPublicRead(publicReadMetaFromPost(post))
  if (!canResolveArticleDetail(readClass)) return { resolvable: false, index: false, follow: false }
  const robots = buildPostMetadata(post, { robotsOverride: robotsForPublicReadClass(readClass) }).robots as
    | { index?: boolean; follow?: boolean }
    | undefined
  return { resolvable: true, index: robots?.index === true, follow: robots?.follow !== false }
}

export async function getReelBySlug(slug: string): Promise<ReelRecord | null> {
  const snap = await getAdminFirestore().collection(REEL_VIDEOS).where('slug', '==', slug).limit(1).get()
  const d = snap.docs[0]
  if (!d) return null
  const x = d.data() as Record<string, unknown>
  const iso = (v: unknown) => {
    const t = v as { toDate?: () => Date } | null
    return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null
  }
  if (typeof x.url !== 'string' || !x.url) return null
  return {
    newsId: d.id,
    slug: (x.slug as string) ?? null,
    headline: (x.headline as string) ?? '',
    url: x.url,
    coverUrl: (x.coverUrl as string) ?? null,
    seconds: typeof x.seconds === 'number' ? x.seconds : null,
    persona: (x.persona as string) ?? null,
    style: (x.style as string) ?? null,
    media: (x.media as string) ?? null,
    by: (x.by as string) ?? null,
    createdAt: iso(x.createdAt),
    updatedAt: iso(x.updatedAt),
    renders: typeof x.renders === 'number' ? x.renders : 1,
  }
}

export type ReelSitemapEntry = { reel: ReelRecord; post: Post }

/** Reels whose story is public AND indexable — for the video sitemap. */
export async function listIndexableReels(limit = 200): Promise<ReelSitemapEntry[]> {
  const reels = (await listReels(limit)).filter((r) => r.slug && r.url)
  if (reels.length === 0) return []
  const db = getAdminFirestore()
  const docs = await db.getAll(...reels.map((r) => db.collection(Collections.NEWS).doc(r.newsId)))
  const out: ReelSitemapEntry[] = []
  docs.forEach((doc, i) => {
    if (!doc.exists) return
    const post = newsDocToPost(doc.id, doc.data() as NewsDocument)
    if (!post || post.slug !== reels[i].slug) return
    if (!articleRobots(post).index) return
    out.push({ reel: reels[i], post })
  })
  return out
}
