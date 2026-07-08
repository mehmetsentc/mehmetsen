import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import { hasVideoContent, isPubliclyVisibleStatus } from '@/lib/postUtils'
import { withTimeout } from '@/lib/asyncUtils'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { isValidUserData, normalizeUser } from '@/services/userService'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'

const SEARCH_POOL = 120        // son N makale bellekte tam-metin taraması için
const TAG_FETCH_LIMIT = 60     // tag sorgusu maks döküman sayısı
const QUERY_TIMEOUT_MS = 8_000
const MIN_QUERY_LENGTH = 2

export type SearchCategory = (typeof DEFAULT_CATEGORIES)[number]

export interface SearchResults {
  posts: Post[]
  videos: Post[]
  users: User[]
  categories: SearchCategory[]
}

export interface SearchOptions {
  maxPerType?: number
  /** Etiket tıklaması — sadece tag sorgusu, kullanıcı/havuz taraması yok */
  tagOnly?: boolean
}

function normalizeTerm(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').replace(/^@/, '')
}

function matchesPost(post: Post, term: string): boolean {
  const haystack = [
    post.title,
    post.content,
    post.summary,
    post.authorUsername,
    post.authorDisplayName,
    post.city ?? '',
    post.categoryId,
    ...(post.tags ?? []),
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR')

  return haystack.includes(term)
}

/**
 * Tag'e göre Firestore array-contains sorgusu.
 * orderBy olmadan çalışır — composite index gerektirmez.
 * Tag'ler büyük/küçük harf farklılığı olabileceğinden birden fazla varyant denenır.
 */
async function fetchByTag(term: string): Promise<Post[]> {
  try {
    const snap = await withTimeout(
      getDocs(
        query(
          collection(db, VIDEO_FEED_COLLECTION),
          where('tags', 'array-contains', term),
          limit(TAG_FETCH_LIMIT)
        )
      ),
      QUERY_TIMEOUT_MS,
      'search-tag'
    )
    return mapNewsSnapshot(snap.docs)
      .filter((p) => isPubliclyVisibleStatus(p.status))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return []
  }
}

async function fetchRecentPosts(): Promise<Post[]> {
  try {
    const snap = await withTimeout(
      getDocs(
        query(collection(db, VIDEO_FEED_COLLECTION), orderBy('createdAt', 'desc'), limit(SEARCH_POOL))
      ),
      QUERY_TIMEOUT_MS,
      'search-posts'
    )
    return mapNewsSnapshot(snap.docs).filter((p) => isPubliclyVisibleStatus(p.status))
  } catch {
    const snap = await withTimeout(
      getDocs(query(collection(db, VIDEO_FEED_COLLECTION), limit(SEARCH_POOL))),
      QUERY_TIMEOUT_MS,
      'search-posts-fallback'
    )
    return mapNewsSnapshot(snap.docs)
      .filter((p) => isPubliclyVisibleStatus(p.status))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
}

async function searchPosts(term: string, maxResults: number, tagOnly = false): Promise<Post[]> {
  const tagPosts = await fetchByTag(term)

  if (tagOnly) {
    return tagPosts.slice(0, maxResults)
  }

  if (tagPosts.length >= maxResults) {
    return tagPosts.slice(0, maxResults)
  }

  const poolPosts = await fetchRecentPosts()
  const poolMatches = poolPosts.filter((p) => matchesPost(p, term))

  const seen = new Set<string>()
  const merged: Post[] = []
  for (const post of [...tagPosts, ...poolMatches]) {
    if (!seen.has(post.id)) {
      seen.add(post.id)
      merged.push(post)
    }
  }

  return merged
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, maxResults)
}

function userFromDoc(uid: string, data: Record<string, unknown>): User | null {
  if (!isValidUserData(data)) return null
  const user = normalizeUser(uid, data)
  if (user.isBlocked) return null
  return user
}

function matchesUser(user: User, normalized: string): boolean {
  const haystack = [user.username, user.displayName, user.bio ?? '']
    .join(' ')
    .toLocaleLowerCase('tr-TR')
  return haystack.includes(normalized)
}

async function searchUsers(term: string, maxResults: number): Promise<User[]> {
  const normalized = term.replace(/^@/, '')
  if (normalized.length < MIN_QUERY_LENGTH) return []

  const users: User[] = []
  const seen = new Set<string>()

  const addFromSnapshot = (uid: string, data: Record<string, unknown>) => {
    if (seen.has(uid)) return
    seen.add(uid)
    const user = userFromDoc(uid, data)
    if (user && matchesUser(user, normalized)) users.push(user)
  }

  try {
    const prefixSnap = await getDocs(
      query(
        collection(db, Collections.USERS),
        where('username', '>=', normalized),
        where('username', '<=', `${normalized}\uf8ff`),
        limit(maxResults)
      )
    )
    for (const docSnap of prefixSnap.docs) {
      addFromSnapshot(docSnap.id, docSnap.data() as Record<string, unknown>)
    }
  } catch {
    // username index may be missing
  }

  if (users.length < maxResults) {
    try {
      const poolSnap = await getDocs(query(collection(db, Collections.USERS), limit(40)))
      for (const docSnap of poolSnap.docs) {
        addFromSnapshot(docSnap.id, docSnap.data() as Record<string, unknown>)
        if (users.length >= maxResults) break
      }
    } catch {
      // ignore
    }
  }

  return users.slice(0, maxResults)
}

function searchCategories(term: string): SearchCategory[] {
  return DEFAULT_CATEGORIES.filter(
    (cat) =>
      cat.name.toLocaleLowerCase('tr-TR').includes(term) ||
      cat.id.includes(term) ||
      cat.slug.includes(term)
  )
}

export const searchService = {
  normalizeTerm,

  async search(rawTerm: string, options: SearchOptions = {}): Promise<SearchResults> {
    const { maxPerType = 12, tagOnly = false } = options
    const term = normalizeTerm(rawTerm)
    if (term.length < MIN_QUERY_LENGTH) {
      return { posts: [], videos: [], users: [], categories: [] }
    }

    const [matchedPosts, users] = await Promise.all([
      searchPosts(term, maxPerType * 2, tagOnly),
      tagOnly ? Promise.resolve([]) : searchUsers(term, maxPerType),
    ])

    const videos = matchedPosts.filter(hasVideoContent).slice(0, maxPerType)
    const posts = matchedPosts.filter((p) => !hasVideoContent(p)).slice(0, maxPerType)
    const categories = tagOnly ? [] : searchCategories(term)

    return { posts, videos, users, categories }
  },
}
