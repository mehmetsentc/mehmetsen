'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { searchService, type SearchResults } from '@/services/searchService'

const DEBOUNCE_MS = 350

const emptyResults: SearchResults = {
  posts: [],
  videos: [],
  users: [],
  categories: [],
}

export function useSearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResults>(emptyResults)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const requestIdRef = useRef(0)

  const runSearch = useCallback(async (term: string) => {
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
      const next = await searchService.search(term)
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
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults(emptyResults)
      setSearched(false)
      setError(null)
      return
    }

    const timer = setTimeout(() => {
      void runSearch(query)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, runSearch])

  const submit = useCallback(() => {
    void runSearch(query)
  }, [query, runSearch])

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    searched,
    submit,
  }
}
