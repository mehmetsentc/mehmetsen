import { DEFAULT_CATEGORIES } from '@/constants/config'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'

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

const emptyResults: SearchResults = {
  posts: [],
  videos: [],
  users: [],
  categories: [],
}

function normalizeTerm(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').replace(/^@/, '')
}

/**
 * Client search — Firestore tarama tarayıcıda değil, /api/search üzerinden.
 * Ana thread'i Firestore SDK + 120 doküman taramasından kurtarır (INP).
 */
export const searchService = {
  normalizeTerm,

  async search(rawTerm: string, options: SearchOptions = {}): Promise<SearchResults> {
    const { maxPerType = 12, tagOnly = false } = options
    const term = normalizeTerm(rawTerm)
    if (term.length < MIN_QUERY_LENGTH) return emptyResults

    const params = new URLSearchParams({
      q: term,
      limit: String(maxPerType),
    })
    if (tagOnly) params.set('tag', '1')

    const res = await fetch(`/api/search?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'default',
    })

    if (!res.ok) {
      throw new Error('Arama başarısız')
    }

    const data = (await res.json()) as SearchResults
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      videos: Array.isArray(data.videos) ? data.videos : [],
      users: Array.isArray(data.users) ? data.users : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
    }
  },
}
