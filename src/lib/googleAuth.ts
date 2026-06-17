import {
  GoogleAuthProvider,
  getRedirectResult,
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

let googleSignInPromise: Promise<UserCredential | 'redirect'> | null = null
let redirectResultPromise: Promise<UserCredential | null> | null = null

function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /FBAN|FBAV|Instagram|Twitter|Line\//i.test(navigator.userAgent)
}

async function runGoogleSignIn(auth: Auth): Promise<UserCredential | 'redirect'> {
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

/** Prevents overlapping popup requests (auth/cancelled-popup-request). */
export function signInWithGoogle(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (!googleSignInPromise) {
    googleSignInPromise = runGoogleSignIn(auth).finally(() => {
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
