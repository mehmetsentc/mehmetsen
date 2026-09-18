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
export const DEFAULT_THEME: ThemePreference = 'system'

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
  return DEFAULT_THEME
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
