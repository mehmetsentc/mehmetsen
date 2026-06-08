'use client'

import { createContext, useState, useEffect, useMemo, useCallback, ReactNode, useContext } from 'react'
import {
  Language,
  getStoredLanguagePreference,
  setStoredLanguage,
  guessClientLanguage,
  DEFAULT_LANGUAGE,
} from '@/lib/i18n'
import { translations } from '@/constants/translations'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
}: {
  children: ReactNode
  initialLanguage?: Language
}) {
  // Start from the server-resolved language (cookie/geo) so the first client
  // render matches the server and there is no hydration mismatch.
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  useEffect(() => {
    // Precedence: explicit stored preference > server geo default > client guess.
    const stored = getStoredLanguagePreference()
    if (stored) {
      if (stored !== language) setLanguageState(stored)
      return
    }
    // No explicit choice and no geo signal (server fell back to default):
    // make a best-effort client guess from timezone/navigator.
    if (initialLanguage === DEFAULT_LANGUAGE) {
      const guess = guessClientLanguage()
      if (guess !== language) setLanguageState(guess)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    setStoredLanguage(lang)
  }, [])

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.')
      let value: unknown = translations[language]

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k]
        } else {
          return key
        }
      }

      return typeof value === 'string' ? value : key
    },
    [language]
  )

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
