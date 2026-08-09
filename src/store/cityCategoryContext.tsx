'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CityCategory } from '@/services/cityNewsService.server'

interface CityCategoryContextValue {
  categories: CityCategory[]
  activeCategoryId: string | null
  setActiveCategoryId: (id: string | null) => void
}

const CityCategoryContext = createContext<CityCategoryContextValue | null>(null)

export function CityCategoryProvider({
  categories,
  children,
}: {
  categories: CityCategory[]
  children: ReactNode
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)

  const setCategory = useCallback((id: string | null) => {
    setActiveCategoryId(id)
  }, [])

  return (
    <CityCategoryContext.Provider
      value={{ categories, activeCategoryId, setActiveCategoryId: setCategory }}
    >
      {children}
    </CityCategoryContext.Provider>
  )
}

export function useCityCategoryFilter(): CityCategoryContextValue {
  const ctx = useContext(CityCategoryContext)
  if (!ctx) {
    throw new Error('useCityCategoryFilter must be used within CityCategoryProvider')
  }
  return ctx
}
