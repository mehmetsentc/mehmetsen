'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useLanguage } from '@/store/languageContext'
import { useTheme } from '@/store/themeContext'
import { ROUTES } from '@/constants/routes'
import { LANGUAGES, type Language } from '@/lib/i18n'
import type { ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

const themeOptions: { id: ThemePreference; icon: typeof Sun; labelKey: string }[] = [
  { id: 'light', icon: Sun, labelKey: 'settings.lightMode' },
  { id: 'dark', icon: Moon, labelKey: 'settings.darkMode' },
  { id: 'system', icon: Monitor, labelKey: 'settings.autoMode' },
]

export default function AppearanceSettingsPage() {
  const { t, language, setLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <SettingsHeader title="Görünüm" backHref={ROUTES.SETTINGS} backLabel="Ayarlar" />

      <SettingsSection title="Tema">
        {themeOptions.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={cn(
              'settings-option-row',
              theme === id && 'settings-option-row-active'
            )}
          >
            <span className="settings-item-icon">
              <Icon className="h-5 w-5" />
            </span>
            <span className="settings-item-label flex-1">{t(labelKey)}</span>
            {theme === id && (
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                Seçili
              </span>
            )}
          </button>
        ))}
      </SettingsSection>

      <SettingsSection title="Dil">
        {(Object.entries(LANGUAGES) as [Language, (typeof LANGUAGES)[Language]][]).map(
          ([lang, { name, flag }]) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={cn(
                'settings-option-row',
                language === lang && 'settings-option-row-active'
              )}
            >
              <span className="settings-item-icon text-lg">{flag}</span>
              <span className="settings-item-label flex-1">{name}</span>
              {language === lang && (
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Seçili
                </span>
              )}
            </button>
          )
        )}
      </SettingsSection>
    </>
  )
}
