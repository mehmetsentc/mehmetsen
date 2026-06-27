/**
 * Apple Sign-In via Firebase OAuthProvider('apple.com')
 *
 * Apple Store kapsayıcısı (PWA → Capacitor) için zorunlu provider.
 * Firebase Console → Authentication → Sign-in method → Apple etkinleştirilmiş
 * olmalı ve App Store Connect tarafında "Sign in with Apple" capability
 * service ID + key/team konfigürasyonu yapılmış olmalı.
 */
import {
  OAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type UserCredential,
} from 'firebase/auth'

function buildAppleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  // Türkçe kullanıcı deneyimi — Apple onay ekranı tr_TR olarak görünür.
  provider.setCustomParameters({ locale: 'tr_TR' })
  return provider
}

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
])

let appleSignInPromise: Promise<UserCredential | 'redirect'> | null = null
let redirectResultPromise: Promise<UserCredential | null> | null = null

function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /FBAN|FBAV|Instagram|Twitter|Line\//i.test(navigator.userAgent)
}

async function runAppleSignIn(auth: Auth): Promise<UserCredential | 'redirect'> {
  const provider = buildAppleProvider()

  if (isInAppBrowser()) {
    await signInWithRedirect(auth, provider)
    return 'redirect'
  }

  try {
    return await signInWithPopup(auth, provider)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    if (POPUP_FALLBACK_CODES.has(code)) {
      await signInWithRedirect(auth, provider)
      return 'redirect'
    }
    throw error
  }
}

/** Eş zamanlı çoklu popup isteklerini önler (auth/cancelled-popup-request). */
export function signInWithApple(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (!appleSignInPromise) {
    appleSignInPromise = runAppleSignIn(auth).finally(() => {
      appleSignInPromise = null
    })
  }
  return appleSignInPromise
}

/** App startup'ta bir kez çağrılır — setPersistence öncesi. */
export function completeAppleRedirectSignIn(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth).catch((error) => {
      redirectResultPromise = null
      throw error
    })
  }
  return redirectResultPromise
}
