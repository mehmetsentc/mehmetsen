import type { Post } from '@/types/post'
import {
  getVisualVideoDedupKey,
  hasPlayableVisualVideo,
  type VisualVideoCandidate,
} from '@/lib/videoFeed/playableVisual'

function asCandidate(post: Post): VisualVideoCandidate {
  return post as Post & VisualVideoCandidate
}

function isCanonicalPublished(post: Post): boolean {
  const extra = asCandidate(post)
  if (extra.isTTS) return false
  return post.status === 'published' || !post.status
}

function metadataScore(post: Post): number {
  let score = 0
  if (post.title?.trim()) score += 2
  if (post.summary?.trim() || post.content?.trim()) score += 1
  if (post.coverImageUrl) score += 1
  if (post.slug?.trim() && post.slug !== post.id) score += 1
  if (post.source?.trim() || post.sourceUrl?.trim()) score += 1
  return score
}

function publishedTime(post: Post): number {
  const raw = post.publishedAt || post.createdAt || ''
  const time = Date.parse(raw)
  return Number.isFinite(time) ? time : 0
}

export function selectVisualVideoWinner(group: Post[]): Post {
  return [...group].sort((a, b) => {
    const canonical = Number(isCanonicalPublished(b)) - Number(isCanonicalPublished(a))
    if (canonical !== 0) return canonical
    const meta = metadataScore(b) - metadataScore(a)
    if (meta !== 0) return meta
    const time = publishedTime(b) - publishedTime(a)
    if (time !== 0) return time
    return String(a.id).localeCompare(String(b.id))
  })[0]!
}

/**
 * Keep one representative per canonical provider video ID, then normalized URL.
 * Order follows the first occurrence of each key in the incoming list.
 */
export function pickVisualVideoRepresentative(posts: Post[]): Post[] {
  const groups = new Map<string, Post[]>()
  for (const post of posts) {
    if (!hasPlayableVisualVideo(asCandidate(post))) continue
    const key = getVisualVideoDedupKey(asCandidate(post))
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(post)
    groups.set(key, list)
  }

  const winnerByKey = new Map<string, Post>()
  for (const [key, group] of groups) {
    winnerByKey.set(key, selectVisualVideoWinner(group))
  }

  const seen = new Set<string>()
  const out: Post[] = []
  for (const post of posts) {
    const key = getVisualVideoDedupKey(asCandidate(post))
    if (!key || seen.has(key)) continue
    const winner = winnerByKey.get(key)
    if (!winner) continue
    seen.add(key)
    out.push(winner)
  }
  return out
}

function clusterIdOf(post: Post): string | null {
  const value = asCandidate(post).clusterId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Read-only cluster suppression. No-ops when clusterId is absent on the
 * mapped news posts (current production mapper does not populate it).
 */
export function suppressClusterDuplicates(posts: Post[]): {
  posts: Post[]
  clusterApplied: boolean
} {
  const clustered = posts.filter((post) => clusterIdOf(post))
  if (clustered.length === 0) return { posts, clusterApplied: false }

  const seen = new Set<string>()
  const out: Post[] = []
  for (const post of posts) {
    const clusterId = clusterIdOf(post)
    if (!clusterId) {
      out.push(post)
      continue
    }
    if (seen.has(clusterId)) continue
    const group = posts.filter((item) => clusterIdOf(item) === clusterId)
    seen.add(clusterId)
    out.push(selectVisualVideoWinner(group))
  }
  return { posts: out, clusterApplied: true }
}
