import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { mapNewsSnapshot } from '@/lib/newsMapper'
import { hasVideoContent, isPubliclyVisibleStatus } from '@/lib/postUtils'
import { withTimeout } from '@/lib/asyncUtils'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { userService } from '@/services/userService'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'

const SEARCH_POOL = 300        // son N makale bellekte tam-metin taraması için
const TAG_FETCH_LIMIT = 150    // tag sorgusu maks döküman sayısı
const QUERY_TIMEOUT_MS = 12_000
const MIN_QUERY_LENGTH = 2

export type SearchCategory = (typeof DEFAULT_CATEGORIES)[number]

export interface SearchResults {
  posts: Post[]
  videos: Post[]
  users: User[]
  categories: SearchCategory[]
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
  // Tags farklı büyük/küçük harf biçimlerinde saklanmış olabilir
  const variants = new Set<string>([
    term,                                                    // normalized (lowercase)
    term.charAt(0).toUpperCase() + term.slice(1),           // Title case
    term.toUpperCase(),                                      // ALL CAPS
  ])

  const seen = new Set<string>()
  const results: Post[] = []

  await Promise.allSettled(
    [...variants].map(async (variant) => {
      try {
        const snap = await withTimeout(
          getDocs(
            query(
              collection(db, VIDEO_FEED_COLLECTION),
              where('tags', 'array-contains', variant),
              limit(TAG_FETCH_LIMIT)
            )
          ),
          QUERY_TIMEOUT_MS,
          `search-tag-${variant}`
        )
        for (const post of mapNewsSnapshot(snap.docs)) {
          if (!seen.has(post.id) && isPubliclyVisibleStatus(post.status)) {
            seen.add(post.id)
            results.push(post)
          }
        }
      } catch {
        // Index eksik veya sorgu başarısız — sessizce atla
      }
    })
  )

  return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
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

async function searchPosts(term: string, maxResults: number): Promise<Post[]> {
  // Tag sorgusu (tüm arşiv) + son makaleler havuzu paralel çalışır
  const [tagPosts, poolPosts] = await Promise.all([
    fetchByTag(term),
    fetchRecentPosts(),
  ])

  // Son makaleleri bellekte filtrele (başlık, içerik, özet vb.)
  const poolMatches = poolPosts.filter((p) => matchesPost(p, term))

  // Birleştir: tag sonuçları önce (daha kesin), ardından havuz eşleşmeleri
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

async function searchUsers(term: string, maxResults: number): Promise<User[]> {
  const normalized = term.replace(/^@/, '')
  if (normalized.length < MIN_QUERY_LENGTH) return []

  const users: User[] = []
  const seen = new Set<string>()

  const addUser = async (uid: string) => {
    if (seen.has(uid)) return
    seen.add(uid)
    const user = await userService.getByUid(uid)
    if (!user || user.isBlocked) return
    const haystack = [user.username, user.displayName, user.bio ?? '']
      .join(' ')
      .toLocaleLowerCase('tr-TR')
    if (haystack.includes(normalized)) users.push(user)
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
    await Promise.all(prefixSnap.docs.map((docSnap) => addUser(docSnap.id)))
  } catch {
    // username index may be missing
  }

  if (users.length < maxResults) {
    try {
      const poolSnap = await getDocs(query(collection(db, Collections.USERS), limit(80)))
      await Promise.all(poolSnap.docs.map((docSnap) => addUser(docSnap.id)))
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

  async search(rawTerm: string, maxPerType = 12): Promise<SearchResults> {
    const term = normalizeTerm(rawTerm)
    if (term.length < MIN_QUERY_LENGTH) {
      return { posts: [], videos: [], users: [], categories: [] }
    }

    const [matchedPosts, users] = await Promise.all([
      searchPosts(term, maxPerType * 2),
      searchUsers(term, maxPerType),
    ])

    const videos = matchedPosts.filter(hasVideoContent).slice(0, maxPerType)
    const posts = matchedPosts.filter((p) => !hasVideoContent(p)).slice(0, maxPerType)
    const categories = searchCategories(term)

    return { posts, videos, users, categories }
  },
}
