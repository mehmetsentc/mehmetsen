'use client'

import { useMemo } from 'react'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Bookmark,
  ChevronRight,
  CircleHelp,
  Globe,
  Info,
  Moon,
  Search,
  Shield,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsItem } from '@/components/settings/SettingsItem'
import { Avatar } from '@/components/ui/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/store/languageContext'
import { useTheme } from '@/store/themeContext'
import { ROUTES } from '@/constants/routes'
import { LANGUAGES } from '@/lib/i18n'
import { APP_CONFIG } from '@/constants/config'

type SettingsEntry = {
  id: string
  section: string
  icon?: typeof Bell
  label: string
  description?: string
  value?: string
  href?: string
  onClick?: () => void
  destructive?: boolean
  keywords?: string[]
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { language, t } = useLanguage()
  const { theme } = useTheme()
  const [query, setQuery] = usePageState(PAGE_STATE_KEYS.settingsQuery, '')

  const themeLabel =
    theme === 'light'
      ? t('settings.lightMode')
      : theme === 'dark'
        ? t('settings.darkMode')
        : t('settings.autoMode')

  const handleLogout = async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
  }

  const entries: SettingsEntry[] = useMemo(
    () => [
      {
        id: 'profile-interests',
        section: 'Nasıl kullanıyorsun?',
        icon: Sparkles,
        label: 'Profil ve İlgi Alanları',
        description: 'Avatar, biyografi, haber kategorileri ve spor tercihleri',
        href: ROUTES.SETTINGS_PROFILE,
        keywords: ['profil', 'ilgi', 'kategori', 'spor', 'avatar', 'biyografi', 'şehir', 'takım'],
      },
      {
        id: 'saved',
        section: 'Nasıl kullanıyorsun?',
        icon: Bookmark,
        label: 'Kaydedilenler',
        href: ROUTES.SAVED,
        keywords: ['kaydet', 'bookmark', 'saved'],
      },
      {
        id: 'notifications',
        section: 'Nasıl kullanıyorsun?',
        icon: Bell,
        label: 'Bildirimler',
        href: ROUTES.SETTINGS_NOTIFICATIONS,
        keywords: ['bildirim', 'notification', 'beğeni', 'yorum'],
      },
      {
        id: 'privacy',
        section: 'Nasıl kullanıyorsun?',
        icon: Shield,
        label: 'Gizlilik',
        href: ROUTES.SETTINGS_PRIVACY,
        keywords: ['gizlilik', 'güvenlik', 'privacy', 'profil', 'konum'],
      },
      {
        id: 'appearance',
        section: 'Uygulama',
        icon: Moon,
        label: 'Görünüm',
        value: themeLabel,
        href: ROUTES.SETTINGS_APPEARANCE,
        keywords: ['tema', 'theme', 'karanlık', 'dark', 'light'],
      },
      {
        id: 'language',
        section: 'Uygulama',
        icon: Globe,
        label: t('settings.language'),
        value: LANGUAGES[language].name,
        href: ROUTES.SETTINGS_APPEARANCE,
        keywords: ['dil', 'language', 'english', 'türkçe'],
      },
      {
        id: 'help',
        section: 'Daha fazla bilgi ve destek',
        icon: CircleHelp,
        label: 'Yardım',
        href: ROUTES.SETTINGS_HELP,
        keywords: ['yardım', 'help', 'destek', 'sorun'],
      },
      {
        id: 'about',
        section: 'Daha fazla bilgi ve destek',
        icon: Info,
        label: 'Hakkında',
        href: ROUTES.SETTINGS_ABOUT,
        keywords: ['hakkında', 'about', 'sürüm', 'version'],
      },
    ],
    [language, t, themeLabel]
  )

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const filtered = normalizedQuery
    ? entries.filter((entry) => {
        const haystack = [entry.label, entry.section, ...(entry.keywords ?? [])]
          .join(' ')
          .toLocaleLowerCase('tr-TR')
        return haystack.includes(normalizedQuery)
      })
    : entries

  const sections = useMemo(() => {
    const map = new Map<string, SettingsEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.section) ?? []
      list.push(entry)
      map.set(entry.section, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="settings-hub-grid">
      <div className="settings-hub-span">
        <SettingsHeader title="Ayarlar ve hareketler" backHref={ROUTES.FEED} />

        <label className="settings-search">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ara"
            className="settings-search-input"
          />
        </label>
      </div>

      {user && (
        <SettingsSection title="Hesabın" className="settings-hub-span">
          <Link href={ROUTES.PROFILE(user.username)} className="settings-account-card">
            <Avatar name={user.displayName} src={user.photoURL} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[rgb(var(--color-text))]">
                {user.displayName}
              </span>
              <span className="block truncate text-xs text-[rgb(var(--color-muted))]">
                @{user.username}
              </span>
              <span className="mt-1 block text-xs text-[rgb(var(--color-muted))]">
                Profil, gizlilik ve hesap ayarları
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
          </Link>
        </SettingsSection>
      )}

      {!user && (
        <SettingsSection title="Hesabın" className="settings-hub-span">
          <SettingsItem
            icon={User}
            label="Giriş yap"
            description="Hesap ayarlarını yönetmek için oturum açın"
            href={ROUTES.LOGIN}
          />
        </SettingsSection>
      )}

      {sections.length === 0 ? (
        <p className="settings-hub-span px-1 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
          &quot;{query}&quot; için sonuç bulunamadı.
        </p>
      ) : (
        sections.map(([title, items]) => (
          <SettingsSection key={title} title={title}>
            {items.map((item) => (
              <SettingsItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                description={item.description}
                value={item.value}
                href={item.href}
                onClick={item.onClick}
                destructive={item.destructive}
              />
            ))}
          </SettingsSection>
        ))
      )}

      {user && (
        <SettingsSection title="Oturum" className="settings-hub-span">
          <SettingsItem
            label="Çıkış yap"
            onClick={handleLogout}
            destructive
          />
          <SettingsItem
            icon={Trash2}
            label="Hesabı Sil"
            description="Profilinizi ve verilerinizi kalıcı olarak kaldırır"
            href={ROUTES.SETTINGS_ACCOUNT_DELETE}
            destructive
          />
        </SettingsSection>
      )}

      <p className="settings-hub-span px-1 pb-4 text-center text-xs text-[rgb(var(--color-muted))]">
        {APP_CONFIG.NAME} · Sosyal haber platformu
      </p>
    </div>
  )
}
