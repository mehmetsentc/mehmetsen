'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { searchService, type SearchOptions, type SearchResults } from '@/services/searchService'

const DEBOUNCE_MS = 350

const emptyResults: SearchResults = {
  posts: [],
  videos: [],
  users: [],
  categories: [],
}

export function useSearch(initialQuery = '', initialTagOnly = false) {
  const [query, setQuery] = useState(initialQuery)
  const [tagOnly, setTagOnly] = useState(initialTagOnly)
  const [results, setResults] = useState<SearchResults>(emptyResults)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const requestIdRef = useRef(0)
  const skipDebounceRef = useRef(initialQuery.trim().length >= 2)

  const runSearch = useCallback(async (term: string, options?: Pick<SearchOptions, 'tagOnly'>) => {
    const normalized = searchService.normalizeTerm(term)
    if (normalized.length < 2) {
      setResults(emptyResults)
      setSearched(false)
      setError(null)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const next = await searchService.search(term, {
        tagOnly: options?.tagOnly ?? tagOnly,
      })
      if (requestId !== requestIdRef.current) return
      setResults(next)
      setSearched(true)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Arama başarısız')
      setResults(emptyResults)
      setSearched(true)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [tagOnly])

  useEffect(() => {
    if (!query.trim()) {
      setResults(emptyResults)
      setSearched(false)
      setError(null)
      return
    }

    const delay = skipDebounceRef.current ? 0 : DEBOUNCE_MS
    skipDebounceRef.current = false

    const timer = setTimeout(() => {
      void runSearch(query)
    }, delay)

    return () => clearTimeout(timer)
  }, [query, tagOnly, runSearch])

  const submit = useCallback(() => {
    skipDebounceRef.current = true
    void runSearch(query)
  }, [query, runSearch])

  const applyQuery = useCallback((value: string, nextTagOnly = false) => {
    skipDebounceRef.current = true
    setTagOnly(nextTagOnly)
    setQuery(value)
  }, [])

  return {
    query,
    setQuery,
    tagOnly,
    setTagOnly,
    applyQuery,
    results,
    loading,
    error,
    searched,
    submit,
  }
}
