import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type UserCredential,
} from 'firebase/auth'

const googleProvider = new GoogleAuthProvider()

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
])

function isCapacitor(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined'
  )
}

function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /FBAN|FBAV|Instagram|Twitter|Line\//i.test(navigator.userAgent)
}

// ---------- native Capacitor flow ----------

async function signInWithNativeGoogle(auth: Auth): Promise<UserCredential> {
  const { default: NativeGoogleSignIn } = await import('@/plugins/NativeGoogleSignIn')

  let result: import('@/plugins/NativeGoogleSignIn').NativeGoogleSignInResult
  try {
    result = await NativeGoogleSignIn.signIn()
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    const msg = (err as { message?: string }).message ?? ''
    if (
      code === 'SIGN_IN_CANCELED' ||
      msg === 'SIGN_IN_CANCELED' ||
      msg.includes('SIGN_IN_CANCELED') ||
      msg.includes('cancelled') ||
      msg.includes('canceled')
    ) {
      throw Object.assign(new Error('Sign in cancelled'), { code: 'auth/cancelled-popup-request' })
    }
    if (code === 'SIGN_IN_IN_PROGRESS' || msg.includes('SIGN_IN_IN_PROGRESS')) {
      throw Object.assign(new Error('Sign in already in progress'), { code: 'auth/popup-blocked' })
    }
    throw err
  }

  const { idToken, accessToken } = result
  if (!idToken) {
    throw Object.assign(new Error('Missing Google ID token from native sign-in'), {
      code: 'auth/argument-error',
    })
  }

  const credential = GoogleAuthProvider.credential(idToken, accessToken || null)
  return signInWithCredential(auth, credential)
}

// ---------- web Firebase flow ----------

async function runGoogleSignInWeb(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (isInAppBrowser()) {
    await signInWithRedirect(auth, googleProvider)
    return 'redirect'
  }

  try {
    return await signInWithPopup(auth, googleProvider)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    if (POPUP_FALLBACK_CODES.has(code)) {
      await signInWithRedirect(auth, googleProvider)
      return 'redirect'
    }
    throw error
  }
}

// ---------- public API ----------

let googleSignInPromise: Promise<UserCredential | 'redirect'> | null = null
let redirectResultPromise: Promise<UserCredential | null> | null = null

/**
 * Google Sign In başlat.
 * - iOS/Capacitor: Official GoogleSignIn-iOS SDK account sheet → Firebase signInWithCredential
 * - Web: Firebase popup → redirect fallback
 */
export function signInWithGoogle(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (!googleSignInPromise) {
    const run = isCapacitor()
      ? signInWithNativeGoogle(auth)
      : runGoogleSignInWeb(auth)

    googleSignInPromise = run.finally(() => {
      googleSignInPromise = null
    })
  }
  return googleSignInPromise
}

/** Call once on app load — must run before any setPersistence / second sign-in attempt. */
export function completeGoogleRedirectSignIn(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth).catch((error) => {
      redirectResultPromise = null
      throw error
    })
  }
  return redirectResultPromise
}
