import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { newsDocToPost, type NewsDocument } from '@/lib/newsMapper'
import { hasVideoContent, isPubliclyVisibleStatus } from '@/lib/postUtils'
import { isValidUserData, normalizeUser } from '@/services/userService'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'
import type { SearchCategory, SearchOptions, SearchResults } from '@/services/searchService'
import {
  canAppearInSearch,
  classifyPublicRead,
  comparePublicReadPriority,
  logPublicReadClassCounts,
  publicReadMetaFromPost,
  tallyPublicReadClasses,
} from '@/services/editorial/publicReadPolicy'

const SEARCH_POOL = 80
const TAG_FETCH_LIMIT = 40
const MIN_QUERY_LENGTH = 2

export function normalizeSearchTerm(raw: string): string {
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

function matchesUser(user: User, normalized: string): boolean {
  const haystack = [user.username, user.displayName, user.bio ?? '']
    .join(' ')
    .toLocaleLowerCase('tr-TR')
  return haystack.includes(normalized)
}

function searchCategories(term: string): SearchCategory[] {
  return DEFAULT_CATEGORIES.filter(
    (cat) =>
      cat.name.toLocaleLowerCase('tr-TR').includes(term) ||
      cat.id.includes(term) ||
      cat.slug.includes(term)
  ).slice(0, 12)
}

async function fetchByTag(term: string): Promise<Post[]> {
  const db = getAdminFirestore()
  try {
    const snap = await db
      .collection(Collections.NEWS)
      .where('tags', 'array-contains', term)
      .limit(TAG_FETCH_LIMIT)
      .get()
    return snap.docs
      .map((d) => newsDocToPost(d.id, d.data() as NewsDocument))
      .filter((p): p is Post => p !== null && isPubliclyVisibleStatus(p.status))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return []
  }
}

async function fetchRecentPosts(): Promise<Post[]> {
  const db = getAdminFirestore()
  try {
    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(SEARCH_POOL)
      .get()
    return snap.docs
      .map((d) => newsDocToPost(d.id, d.data() as NewsDocument))
      .filter((p): p is Post => p !== null)
  } catch {
    try {
      const snap = await db.collection(Collections.NEWS).limit(SEARCH_POOL).get()
      return snap.docs
        .map((d) => newsDocToPost(d.id, d.data() as NewsDocument))
        .filter((p): p is Post => p !== null && isPubliclyVisibleStatus(p.status))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    } catch {
      return []
    }
  }
}

async function searchPosts(term: string, maxResults: number, tagOnly: boolean): Promise<Post[]> {
  const tagPosts = await fetchByTag(term)
  if (tagOnly) {
    return prioritizeSearchPosts(tagPosts).slice(0, maxResults)
  }
  if (tagPosts.length >= maxResults) {
    return prioritizeSearchPosts(tagPosts).slice(0, maxResults)
  }

  const poolPosts = await fetchRecentPosts()
  const poolMatches = poolPosts.filter((p) => matchesPost(p, term))

  const seen = new Set<string>()
  const merged: Post[] = []
  for (const post of [...tagPosts, ...poolMatches]) {
    if (seen.has(post.id)) continue
    seen.add(post.id)
    merged.push(post)
  }

  return prioritizeSearchPosts(merged).slice(0, maxResults)
}

function prioritizeSearchPosts(posts: Post[]): Post[] {
  const eligible = posts.filter((p) => {
    if (!isPubliclyVisibleStatus(p.status)) return false
    const cls = classifyPublicRead(publicReadMetaFromPost(p))
    return canAppearInSearch(cls)
  })
  return [...eligible].sort((a, b) => {
    const classCmp = comparePublicReadPriority(
      publicReadMetaFromPost(a),
      publicReadMetaFromPost(b)
    )
    if (classCmp !== 0) return classCmp
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}

async function searchUsers(term: string, maxResults: number): Promise<User[]> {
  const normalized = term.replace(/^@/, '')
  if (normalized.length < MIN_QUERY_LENGTH) return []

  const db = getAdminFirestore()
  const users: User[] = []
  const seen = new Set<string>()

  const add = (uid: string, data: Record<string, unknown>) => {
    if (seen.has(uid)) return
    seen.add(uid)
    if (!isValidUserData(data)) return
    const user = normalizeUser(uid, data)
    if (user.isBlocked) return
    if (matchesUser(user, normalized)) users.push(user)
  }

  try {
    const prefixSnap = await db
      .collection(Collections.USERS)
      .where('username', '>=', normalized)
      .where('username', '<=', `${normalized}\uf8ff`)
      .limit(maxResults)
      .get()
    for (const doc of prefixSnap.docs) {
      add(doc.id, doc.data() as Record<string, unknown>)
    }
  } catch {
    /* index may be missing */
  }

  if (users.length < maxResults) {
    try {
      const poolSnap = await db.collection(Collections.USERS).limit(30).get()
      for (const doc of poolSnap.docs) {
        add(doc.id, doc.data() as Record<string, unknown>)
        if (users.length >= maxResults) break
      }
    } catch {
      /* ignore */
    }
  }

  return users.slice(0, maxResults)
}

/** Server-side search used by /api/search — keeps Firestore off the browser main thread. */
export async function runServerSearch(
  rawTerm: string,
  options: SearchOptions = {}
): Promise<SearchResults> {
  const { maxPerType = 12, tagOnly = false } = options
  const term = normalizeSearchTerm(rawTerm)
  if (term.length < MIN_QUERY_LENGTH) {
    return { posts: [], videos: [], users: [], categories: [] }
  }

  const [matchedPosts, users] = await Promise.all([
    searchPosts(term, maxPerType * 2, tagOnly),
    tagOnly ? Promise.resolve([] as User[]) : searchUsers(term, maxPerType),
  ])

  logPublicReadClassCounts(
    'search_results',
    tallyPublicReadClasses(matchedPosts.map((p) => publicReadMetaFromPost(p))),
    { termLength: term.length }
  )

  return {
    posts: matchedPosts.filter((p) => !hasVideoContent(p)).slice(0, maxPerType),
    videos: matchedPosts.filter(hasVideoContent).slice(0, maxPerType),
    users,
    categories: tagOnly ? [] : searchCategories(term),
  }
}
