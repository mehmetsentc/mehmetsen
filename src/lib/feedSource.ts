import type { Post } from '@/types/post'
import { DEFAULT_SOURCE } from '@/lib/newsMapper'

export type FeedSource = 'nahaber' | 'user'

const EDITORIAL_AUTHORS = new Set(['nahaber', 'nahaber-editoryal'])

export function isNaHaberEditorialPost(post: Post): boolean {
  const author = post.authorUsername.trim().toLowerCase()
  const source = post.source.trim().toLowerCase()
  const editorialSource = DEFAULT_SOURCE.toLowerCase()

  if (EDITORIAL_AUTHORS.has(author)) return true
  if (source === editorialSource || source === 'nahaber') return true
  if (post.postType === 'user_post') return false
  return author === editorialSource
}

export function isUserGeneratedPost(post: Post): boolean {
  return !isNaHaberEditorialPost(post)
}

export function filterPostsByFeedSource<T extends Post>(posts: T[], feedSource: FeedSource): T[] {
  return posts.filter((post) =>
    feedSource === 'nahaber' ? isNaHaberEditorialPost(post) : isUserGeneratedPost(post)
  )
}
