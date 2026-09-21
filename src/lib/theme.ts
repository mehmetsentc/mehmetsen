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
  syncBrowserChrome(forcedDark ? 'dark' : resolved)
}

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#faf7f3',
  dark: '#080a10',
  oled: '#000000',
}

function syncBrowserChrome(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const color = THEME_COLOR[resolved]
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)

  let status = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (!status) {
    status = document.createElement('meta')
    status.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
    document.head.appendChild(status)
  }
  status.setAttribute('content', resolved === 'light' ? 'default' : 'black-translucent')
}
