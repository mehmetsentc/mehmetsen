import type { Post } from '@/types/post'
import { DEFAULT_SOURCE } from '@/lib/newsMapper'

export type FeedSource = 'nahaber' | 'user'

const EDITORIAL_AUTHORS = new Set(['nahaber', 'nahaber-editoryal'])

export function isNaHaberEditorialPost(post: Post): boolean {
  // Kullanıcının manuel oluşturduğu postlar editorial değil
  if (post.postType === 'user_post') return false

  const author = (post.authorUsername ?? '').trim().toLowerCase()
  const source = (post.source ?? '').trim().toLowerCase()
  const editorialSource = DEFAULT_SOURCE.toLowerCase()

  // Açıkça editorial olarak işaretlenmiş
  if (EDITORIAL_AUTHORS.has(author)) return true
  if (source === editorialSource || source === 'nahaber') return true

  // Newsroom RSS pipeline haberleri: postType 'news' veya undefined.
  // source = RSS kaynağı adı ('Milliyet', 'Fanatik' vs.) olduğundan
  // yukarıdaki kontrolleri geçemez, ama editorial içerik olduklarından true dön.
  if (!post.postType || post.postType === 'news' || post.postType === 'video') return true

  return false
}

export function isUserGeneratedPost(post: Post): boolean {
  return !isNaHaberEditorialPost(post)
}

export function filterPostsByFeedSource<T extends Post>(posts: T[], feedSource: FeedSource): T[] {
  return posts.filter((post) =>
    feedSource === 'nahaber' ? isNaHaberEditorialPost(post) : isUserGeneratedPost(post)
  )
}
