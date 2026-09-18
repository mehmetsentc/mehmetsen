'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { CityCategory } from '@/services/cityNewsService.server'

interface CityCategoryContextValue {
  categories: CityCategory[]
  /** Spor section pill — false when city has zero spor-family news. */
  hasSpor: boolean
  activeCategoryId: string | null
  setActiveCategoryId: (id: string | null) => void
}

const CityCategoryContext = createContext<CityCategoryContextValue | null>(null)

export const CITY_CATEGORY_EVENT = 'nahaber:city-category'

type CityCategoryWindow = Window & {
  __nahaberApplyCityCategory?: (next: string | null) => void
  __nahaberPendingCityCategory?: string | null
}

export function publishCityCategory(id: string | null) {
  if (typeof window === 'undefined') return
  const w = window as CityCategoryWindow
  w.__nahaberPendingCityCategory = id
  w.__nahaberApplyCityCategory?.(id)
  window.dispatchEvent(
    new CustomEvent(CITY_CATEGORY_EVENT, { detail: { categoryId: id } })
  )
}

function categoryFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('category')
}

export function CityCategoryProvider({
  categories,
  hasSpor = false,
  children,
}: {
  categories: CityCategory[]
  hasSpor?: boolean
  children: ReactNode
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const bootedFromUrl = useRef(false)

  useEffect(() => {
    if (bootedFromUrl.current) return
    bootedFromUrl.current = true
    const fromUrl = categoryFromLocation()
    if (fromUrl) {
      setActiveCategoryId(fromUrl)
      publishCityCategory(fromUrl)
    }
  }, [])

  const setCategory = useCallback((id: string | null) => {
    setActiveCategoryId(id)
    publishCityCategory(id)
  }, [])

  const value = useMemo(
    () => ({ categories, hasSpor, activeCategoryId, setActiveCategoryId: setCategory }),
    [categories, hasSpor, activeCategoryId, setCategory]
  )

  return <CityCategoryContext.Provider value={value}>{children}</CityCategoryContext.Provider>
}

export function useCityCategoryFilter(): CityCategoryContextValue {
  const ctx = useContext(CityCategoryContext)
  if (!ctx) {
    throw new Error('useCityCategoryFilter must be used within CityCategoryProvider')
  }
  return ctx
}

/** National surfaces (feed-v2) may render without a city provider. */
export function useOptionalCityCategoryFilter(): CityCategoryContextValue | null {
  return useContext(CityCategoryContext)
}
