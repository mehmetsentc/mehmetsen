'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CategoryDef } from '@/constants/config'
import type { NewsItem } from '@/types/newsItem'

interface SubTab {
  id: string
  slug: string
  name: string
  color: string
  href: string
  active: boolean
}

export interface ScrollHeaderConfig {
  breakingItems?: NewsItem[]
  showBreaking?: boolean
  subcategories?: SubTab[]
  tabParent?: CategoryDef | null
}

interface ScrollHeaderContextValue {
  config: ScrollHeaderConfig
  setConfig: (config: ScrollHeaderConfig) => void
}

const ScrollHeaderContext = createContext<ScrollHeaderContextValue | null>(null)

export function ScrollHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ScrollHeaderConfig>({})

  const value = useMemo(() => ({ config, setConfig }), [config])

  return <ScrollHeaderContext.Provider value={value}>{children}</ScrollHeaderContext.Provider>
}

export function useScrollHeaderContext(): ScrollHeaderContextValue {
  const ctx = useContext(ScrollHeaderContext)
  if (!ctx) {
    throw new Error('useScrollHeaderContext must be used within ScrollHeaderProvider')
  }
  return ctx
}

/** Sayfa bazlı scroll header ayarları — unmount'ta temizlenir */
export function useScrollHeaderConfig(config: ScrollHeaderConfig) {
  const { setConfig } = useScrollHeaderContext()

  useEffect(() => {
    setConfig(config)
    return () => setConfig({})
  }, [
    setConfig,
    config.showBreaking,
    config.tabParent,
    config.subcategories,
    config.breakingItems,
  ])
}
