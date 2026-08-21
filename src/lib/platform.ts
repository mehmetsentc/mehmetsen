/**
 * Runtime platform detection — Capacitor / Cordova native shell vs web browser.
 *
 * SSR-safe: every helper returns a sensible default during server render
 * so React hydration matches between server and client.
 *
 * Important: PWA `display-mode: standalone` alone is NOT native. An Add-to-
 * Home-Screen web app is still the website; the App Store / Play Store
 * Capacitor shell is native and must never show “install / Ana ekrana ekle”
 * CTAs.
 *
 * App Store Review Note: cookie/consent UIs and any web-style tracking
 * prompts MUST be hidden inside the Capacitor iOS shell. Apple rejects
 * apps that ship a custom in-WebView "allow tracking" prompt under
 * Guideline 5.1.2(i).
 */

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

type CordovaBridge = Record<string, unknown>

function getCapacitor(): CapacitorBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor
}

function getCordova(): CordovaBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { cordova?: CordovaBridge }).cordova
}

/**
 * True when running inside a store / hybrid native shell
 * (Capacitor iOS/Android, Cordova, or known native UA markers).
 *
 * Prefer this for install-CTA and other web-only chrome.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false

  const cap = getCapacitor()
  if (cap) {
    if (typeof cap.isNativePlatform === 'function') {
      try {
        if (cap.isNativePlatform()) return true
      } catch {
        /* fall through */
      }
    }
    if (typeof cap.getPlatform === 'function') {
      try {
        const p = cap.getPlatform()
        if (p === 'ios' || p === 'android') return true
      } catch {
        /* fall through */
      }
    }
  }

  if (getCordova()) return true

  const w = window as unknown as {
    PhoneGap?: unknown
    phonegap?: unknown
    Ionic?: unknown
  }
  if (w.PhoneGap != null || w.phonegap != null || w.Ionic != null) return true

  try {
    const ua = navigator.userAgent || ''
    // Capacitor / Ionic / Cordova inject markers into WKWebView / WebView UA.
    if (/Capacitor/i.test(ua)) return true
    if (/Cordova/i.test(ua)) return true
    if (/; wv\)/i.test(ua) && /Android/i.test(ua)) {
      // Android WebView (Play Store shell often uses "; wv)")
      // Only treat as native when Capacitor/Cordova bridge is also present,
      // otherwise Chrome Custom Tabs / in-app browsers would match.
      if (cap || getCordova()) return true
    }
  } catch {
    /* ignore */
  }

  return false
}

/**
 * True when the JS bundle is running inside the Capacitor native shell
 * (iOS App Store build or Android wrapper).
 *
 * Alias of {@link isNativeApp} for existing call sites (consent, soft-prompt).
 */
export function isCapacitorNative(): boolean {
  return isNativeApp()
}

/** True when running inside the iOS App Store wrapper specifically. */
export function isIOSNative(): boolean {
  if (typeof window === 'undefined') return false
  if (!isNativeApp()) return false
  const cap = getCapacitor()
  if (cap?.getPlatform) {
    try {
      return cap.getPlatform() === 'ios'
    } catch {
      /* fall through */
    }
  }
  try {
    const ua = navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(ua)
  } catch {
    return false
  }
}

/** True when running inside an Android Capacitor wrapper. */
export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false
  if (!isNativeApp()) return false
  const cap = getCapacitor()
  if (cap?.getPlatform) {
    try {
      return cap.getPlatform() === 'android'
    } catch {
      /* fall through */
    }
  }
  try {
    return /android/i.test(navigator.userAgent || '')
  } catch {
    return false
  }
}

/** True for browser tab / PWA visits (not inside a store native shell). */
export function isWebBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return !isNativeApp()
}

/**
 * PWA installed as standalone (Add to Home Screen). Not the App Store app.
 * Do not use this alone to hide install CTAs in Capacitor.
 */
export function isPwaStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/**
 * Web-only install / “Ana ekrana ekle” surfaces may show when true.
 * Hidden in native shells and when already running as a PWA standalone.
 */
export function shouldShowWebInstallCta(): boolean {
  if (typeof window === 'undefined') return false
  if (isNativeApp()) return false
  if (isPwaStandaloneDisplay()) return false
  return true
}
