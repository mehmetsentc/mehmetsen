/**
 * Mobile notification soft-prompt — persistence + eligibility helpers.
 *
 * Integrates with Web Notification API (+ OneSignal when loaded).
 * Desktop is excluded; granted permission never re-prompts.
 */

export const SOFT_PROMPT_GRANTED_KEY = 'notificationsSoftPromptGranted'
export const SOFT_PROMPT_DISMISSED_VERSION_KEY = 'notificationsSoftPromptDismissedVersion'
export const SOFT_PROMPT_SESSION_KEY = 'notificationsSoftPromptSessionShown'

const MOBILE_MAX_WIDTH = 900

export type SoftPromptPermission = 'granted' | 'denied' | 'default' | 'unsupported'

/** Build-time app / deploy version for update detection. */
export function getSoftPromptAppVersion(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim()?.slice(0, 7) ||
    ''
  if (fromEnv) return fromEnv
  // Fallback: package version is stable; still works for first-install detection.
  return '0.1.0'
}

export function isNotificationApiAvailable(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined'
}

export function getNotificationPermission(): SoftPromptPermission {
  if (!isNotificationApiAvailable()) return 'unsupported'
  return Notification.permission as SoftPromptPermission
}

/** iOS / Android UA, Capacitor shell, or coarse touch + narrow viewport. */
export function isMobileNotificationSurface(): boolean {
  if (typeof window === 'undefined') return false

  const ua = navigator.userAgent.toLowerCase()
  const isIosUa =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroidUa = /android/.test(ua)

  if (isIosUa || isAndroidUa) return true

  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
      }
    ).Capacitor
    if (cap?.isNativePlatform?.()) return true
    const platform = cap?.getPlatform?.()
    if (platform === 'ios' || platform === 'android') return true
  } catch {
    /* ignore */
  }

  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth <= MOBILE_MAX_WIDTH
  return Boolean(coarse && narrow)
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode / quota */
  }
}

function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function ssSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function isSoftPromptGrantedPersisted(): boolean {
  return lsGet(SOFT_PROMPT_GRANTED_KEY) === '1'
}

export function markSoftPromptGranted(): void {
  lsSet(SOFT_PROMPT_GRANTED_KEY, '1')
}

export function markSoftPromptDismissedForVersion(version = getSoftPromptAppVersion()): void {
  lsSet(SOFT_PROMPT_DISMISSED_VERSION_KEY, version)
}

export function markSoftPromptShownThisSession(): void {
  ssSet(SOFT_PROMPT_SESSION_KEY, '1')
}

export function wasSoftPromptShownThisSession(): boolean {
  return ssGet(SOFT_PROMPT_SESSION_KEY) === '1'
}

/**
 * Whether the Haberler-style soft prompt may appear on this open.
 * - granted (live or persisted) → never
 * - dismissed for current version → wait until version bump
 * - already shown this session → no (avoid spam on SPA navigations)
 */
export function shouldShowNotificationsSoftPrompt(): boolean {
  if (!isMobileNotificationSurface()) return false
  if (!isNotificationApiAvailable()) return false

  const permission = getNotificationPermission()
  if (permission === 'granted') {
    markSoftPromptGranted()
    return false
  }
  if (permission === 'unsupported') return false
  if (isSoftPromptGrantedPersisted()) return false
  if (wasSoftPromptShownThisSession()) return false

  const version = getSoftPromptAppVersion()
  const dismissedVersion = lsGet(SOFT_PROMPT_DISMISSED_VERSION_KEY)
  if (dismissedVersion === version) return false

  return true
}

interface OneSignalNotifications {
  requestPermission?: (fallbackToSettings?: boolean) => Promise<void | boolean>
  permission?: boolean
}

function getOneSignalNotifications(): OneSignalNotifications | null {
  if (typeof window === 'undefined') return null
  const os = (
    window as unknown as {
      OneSignal?: { Notifications?: OneSignalNotifications }
    }
  ).OneSignal
  return os?.Notifications ?? null
}

/**
 * Request browser / OneSignal permission. Prefer OneSignal when the SDK
 * has finished init so push subscription stays in sync.
 */
export async function requestSoftPromptPermission(): Promise<SoftPromptPermission> {
  if (!isNotificationApiAvailable()) return 'unsupported'

  const onesignal = getOneSignalNotifications()
  if (onesignal?.requestPermission) {
    try {
      await onesignal.requestPermission(true)
    } catch {
      /* fall through to native */
    }
    const after = getNotificationPermission()
    if (after === 'granted') markSoftPromptGranted()
    return after
  }

  try {
    const result = await Notification.requestPermission()
    if (result === 'granted') markSoftPromptGranted()
    return result as SoftPromptPermission
  } catch {
    return getNotificationPermission()
  }
}

export function detectSoftPromptOs(): 'ios' | 'android' | 'other' {
  if (typeof window === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  if (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios'
  }
  if (/android/.test(ua)) return 'android'
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
    const p = cap?.getPlatform?.()
    if (p === 'ios') return 'ios'
    if (p === 'android') return 'android'
  } catch {
    /* ignore */
  }
  return 'other'
}

/**
 * Best-effort open of OS / browser notification settings.
 * Most mobile browsers block `chrome://` / app-settings schemes from web;
 * returns false when we should show in-modal instructions instead.
 */
export async function tryOpenNotificationSettings(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          isNativePlatform?: () => boolean
          Plugins?: {
            NativeSettings?: {
              open?: (opts: { optionAndroid?: string; optionIOS?: string }) => Promise<unknown>
            }
            App?: { openUrl?: (opts: { url: string }) => Promise<unknown> }
          }
        }
      }
    ).Capacitor

    if (cap?.isNativePlatform?.()) {
      const nativeSettings = cap.Plugins?.NativeSettings
      if (nativeSettings?.open) {
        await nativeSettings.open({
          optionAndroid: 'application_details',
          optionIOS: 'app',
        })
        return true
      }
      const app = cap.Plugins?.App
      if (app?.openUrl) {
        const os = detectSoftPromptOs()
        const url = os === 'ios' ? 'app-settings:' : 'package:'
        await app.openUrl({ url })
        return true
      }
    }
  } catch {
    /* continue */
  }

  // OneSignal sometimes exposes a helper that opens vendor settings.
  try {
    const onesignal = getOneSignalNotifications()
    if (onesignal?.requestPermission) {
      await onesignal.requestPermission(true)
      return true
    }
  } catch {
    /* ignore */
  }

  return false
}

export function settingsInstructionsForOs(os: 'ios' | 'android' | 'other'): string {
  if (os === 'ios') {
    return 'Ayarlar → Safari (veya NaHaber) → Bildirimler yolundan izin verebilirsiniz. Tarayıcı bir kez “Engelle” dediyse sistem yeniden soramaz.'
  }
  if (os === 'android') {
    return 'Tarayıcı menüsü → Site ayarları / İzinler → Bildirimler → İzin Ver. Engellendiyse yalnızca ayarlardan açılabilir.'
  }
  return 'Tarayıcı veya sistem ayarlarından bu site için bildirim iznini açın.'
}
