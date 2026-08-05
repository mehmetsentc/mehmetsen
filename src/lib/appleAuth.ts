/**
 * Apple Sign-In
 *
 * - Capacitor (iOS): NativeAppleSignInPlugin (ASAuthorizationAppleIDProvider)
 *   → native sheet açılır, tarayıcı açılmaz → App Store Guideline 4 geçer
 * - Web: Firebase OAuthProvider signInWithPopup → redirect fallback
 *
 * Production web bundle includes SIWA Guideline 4 profile persistence (build 15).
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

// ---------- Apple-provided profile (native only) ----------

export interface AppleProfile {
  givenName?: string
  familyName?: string
  email?: string
}

let _pendingAppleProfile: AppleProfile | null = null

/**
 * Consume the Apple-provided name/email captured during the most recent
 * native SIWA flow.  Returns `null` if none is available (web flow or
 * subsequent logins where Apple no longer sends the data).
 *
 * This is intentionally one-shot: call it once after `signInWithApple`
 * succeeds and the data is cleared.
 */
export function consumeAppleProfile(): AppleProfile | null {
  const data = _pendingAppleProfile
  _pendingAppleProfile = null
  return data
}

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

  let result: import('@/plugins/NativeAppleSignIn').NativeAppleSignInResult
  try {
    result = await NativeAppleSignIn.authorize()
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    const msg = (err as { message?: string }).message ?? ''
    // Kullanıcı iptal etti — sessizce rethrow
    // Note: Capacitor 8 may not propagate custom codes, so also check the message string.
    if (
      code === 'SIGN_IN_CANCELED' ||
      msg === 'SIGN_IN_CANCELED' ||
      msg.includes('SIGN_IN_CANCELED') ||
      msg.includes('cancelled') ||
      msg.includes('canceled')
    ) {
      throw Object.assign(new Error('Sign in cancelled'), { code: 'auth/cancelled-popup-request' })
    }
    // Devam eden istek
    if (code === 'SIGN_IN_IN_PROGRESS' || msg.includes('SIGN_IN_IN_PROGRESS')) {
      throw Object.assign(new Error('Sign in already in progress'), { code: 'auth/popup-blocked' })
    }
    throw err
  }

  _pendingAppleProfile = {
    givenName: result.givenName || undefined,
    familyName: result.familyName || undefined,
    email: result.email || undefined,
  }

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
