import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type UserCredential,
} from 'firebase/auth'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

let googleSignInPromise: Promise<UserCredential | 'redirect'> | null = null

function prefersGoogleRedirect(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)
  const isInApp = /FBAN|FBAV|Instagram|Twitter|Line\//i.test(ua)
  return isMobile || isInApp
}

async function runGoogleSignIn(auth: Auth): Promise<UserCredential | 'redirect'> {
  if (prefersGoogleRedirect()) {
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

export async function completeGoogleRedirectSignIn(auth: Auth): Promise<UserCredential | null> {
  return getRedirectResult(auth)
}
