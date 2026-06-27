/**
 * Runtime platform detection — Capacitor (iOS/Android native shell) vs Web.
 *
 * SSR-safe: every helper returns a sensible default during server render
 * so React hydration matches between server and client.
 *
 * App Store Review Note: cookie/consent UIs and any web-style tracking
 * prompts MUST be hidden inside the Capacitor iOS shell. Apple rejects
 * apps that ship a custom in-WebView "allow tracking" prompt under
 * Guideline 5.1.2(i) — the user's tracking permission has to come from
 * the native App Tracking Transparency framework, which we do not need
 * to invoke because the iOS app does not collect tracking-purpose data.
 */

/**
 * True when the JS bundle is running inside the Capacitor native shell
 * (iOS App Store build or Android wrapper).
 */
export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  }).Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function') {
    try {
      return cap.isNativePlatform()
    } catch {
      // fall through to platform string check
    }
  }
  if (typeof cap.getPlatform === 'function') {
    try {
      const p = cap.getPlatform()
      return p === 'ios' || p === 'android'
    } catch {
      return false
    }
  }
  return false
}

/** True when running inside the iOS App Store wrapper specifically. */
export function isIOSNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as {
    Capacitor?: { getPlatform?: () => string }
  }).Capacitor
  if (!cap?.getPlatform) return false
  try {
    return cap.getPlatform() === 'ios'
  } catch {
    return false
  }
}

/** True when running inside an Android Capacitor wrapper. */
export function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as {
    Capacitor?: { getPlatform?: () => string }
  }).Capacitor
  if (!cap?.getPlatform) return false
  try {
    return cap.getPlatform() === 'android'
  } catch {
    return false
  }
}

/** True for browser tab visits (not inside a Capacitor shell). */
export function isWebBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return !isCapacitorNative()
}
