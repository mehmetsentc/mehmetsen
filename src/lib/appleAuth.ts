/**
 * Apple Sign-In
 *
 * - Capacitor (iOS): NativeAppleSignInPlugin (ASAuthorizationAppleIDProvider)
 *   → native sheet açılır, tarayıcı açılmaz → App Store Guideline 4 geçer
 * - Web: Firebase OAuthProvider signInWithPopup → redirect fallback
 */
import {
  OAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type UserCredential,
} from 'firebase/auth'

// ---------- helpers ----------

function buildAppleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  provider.setCustomParameters({ locale: 'tr_TR' })
  return provider
}

/** Capacitor içinde mi çalışıyoruz? (iOS uygulaması) */
function isCapacitor(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined'
  )
}

// ---------- native Capacitor flow ----------

async function signInWithNativeApple(auth: Auth): Promise<UserCredential> {
  // Dinamik import — web build'de bundle'a girmez, Capacitor'da runtime'da yüklenir
  const { default: NativeAppleSignIn } = await import('@/plugins/NativeAppleSignIn')
  const result = await NativeAppleSignIn.authorize()

  const provider = new OAuthProvider('apple.com')
  const credential = provider.credential({
    idToken: result.identityToken,
    rawNonce: result.nonce,
  })

  return signInWithCredential(auth, credential)
}

// ---------- web Firebase flow ----------

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
])

function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /FBAN|FBAV|Instagram|Twitter|Line/i.test(navigator.userAgent)
}

async function runAppleSignInWeb(auth: Auth): Promise<UserCredential | 'redirect'> {
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

// ---------- public API ----------

let appleSignInPromise: Promise<UserCredential | 'redirect'> | null = null
let redirectResultPromise: Promise<UserCredential | null> | null = null

/**
 * Apple Sign In başlat.
 * - iOS/Capacitor: native sheet (tarayıcı açılmaz)
 * - Web: Firebase popup → redirect fallback
 */
export function signInWithApple(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (!appleSignInPromise) {
    const run = isCapacitor()
      ? signInWithNativeApple(auth)
      : runAppleSignInWeb(auth)

    appleSignInPromise = run.finally(() => {
      appleSignInPromise = null
    })
  }
  return appleSignInPromise
}

/** App startup'ta bir kez çağrılır — redirect sonucunu yakalar. */
export function completeAppleRedirectSignIn(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth).catch((error) => {
      redirectResultPromise = null
      throw error
    })
  }
  return redirectResultPromise
}
