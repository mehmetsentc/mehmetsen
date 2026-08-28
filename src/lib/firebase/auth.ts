import { getAuth } from 'firebase/auth'
import { firebaseApp } from './config'

// getAuth includes popupRedirectResolver + persistence — required for Google popup/redirect.
export const auth = getAuth(firebaseApp)

let authReadyPromise: Promise<void> | null = null

/** Waits until Firebase restores any persisted session. */
export function ensureAuthReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (!authReadyPromise) {
    if (typeof auth.authStateReady === 'function') {
      authReadyPromise = auth.authStateReady().then(() => undefined).catch(() => undefined)
    } else {
      authReadyPromise = new Promise<void>((resolve) => {
        const unsub = auth.onAuthStateChanged(() => {
          unsub()
          resolve()
        }, () => resolve())
      })
    }
  }

  return authReadyPromise
}

/** Returns the current Firebase ID token after session is ready, or null if unauthenticated. */
export async function getClientAuthToken(): Promise<string | null> {
  await ensureAuthReady()
  const user = auth.currentUser
  if (!user) return null
  try {
    return await user.getIdToken()
  } catch {
    return null
  }
}
