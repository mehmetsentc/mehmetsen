/**
 * Theme system — F1 (2026)
 *
 * 4 preference değeri:
 *   - 'light'   → açık tema
 *   - 'dark'    → koyu lacivert
 *   - 'oled'    → tam siyah (AMOLED/OLED batarya dostu)
 *   - 'system'  → OS prefers-color-scheme'i takip eder (varsayılan)
 *
 * Resolved değer: 'light' | 'dark' | 'oled'
 *   - documentElement classList: 'dark' eklenir (light hariç)
 *   - documentElement data-theme: 'oled' veya boş
 */

export type ThemePreference = 'light' | 'dark' | 'oled' | 'system'
export type ResolvedTheme = 'light' | 'dark' | 'oled'

export const THEME_STORAGE_KEY = 'nahaber-theme'
/**
 * First visit on every NaHaber surface (nahaber.com and city hosts such as
 * canakkale./antalya.nahaber.com) opens dark. A choice the user makes
 * (light / dark / oled / system) is stored and always wins.
 */
export const DEFAULT_THEME: ThemePreference = 'dark'

/**
 * Desktop (>= 1024px) first visit opens light — newspaper reading surface
 * (BBC / NYT / Guardian pattern). Mobile keeps DEFAULT_THEME. A stored
 * choice still wins on every viewport.
 */
export const DESKTOP_DEFAULT_THEME: ThemePreference = 'light'
export const DESKTOP_THEME_MIN_WIDTH = 1024

/** First-visit theme for the current viewport (no stored preference). */
export function defaultThemeForViewport(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME
  return window.innerWidth >= DESKTOP_THEME_MIN_WIDTH ? DESKTOP_DEFAULT_THEME : DEFAULT_THEME
}

const VALID: ThemePreference[] = ['light', 'dark', 'oled', 'system']

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && VALID.includes(stored as ThemePreference)) {
      return stored as ThemePreference
    }
  } catch {
    // ignore (private mode vb.)
  }
  return defaultThemeForViewport()
}

export function setStoredTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return preference
}

/** Video surfaces stay dark. Feed 2 follows the stored light / dark / system theme. */
export function isForcedDarkPathname(pathname: string): boolean {
  return (
    pathname === '/reels' ||
    pathname.startsWith('/reels/') ||
    pathname === '/video' ||
    pathname.startsWith('/video/')
  )
}

/** Apply class + data-theme to documentElement so token system kicks in. */
export function applyThemeClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const forcedDark = isForcedDarkPathname(pathname)
  const useDark = forcedDark || resolved !== 'light'
  root.classList.toggle('dark', useDark)
  if (!forcedDark && resolved === 'oled') {
    root.setAttribute('data-theme', 'oled')
  } else {
    root.removeAttribute('data-theme')
  }
}
