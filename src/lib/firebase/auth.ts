import { getAuth } from 'firebase/auth'
import { firebaseApp } from './config'

// getAuth includes popupRedirectResolver + persistence — required for Google popup/redirect.
export const auth = getAuth(firebaseApp)

let authReadyPromise: Promise<void> | null = null

/** Waits until Firebase restores any persisted session. */
export function ensureAuthReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (!authReadyPromise) {
    authReadyPromise = auth.authStateReady().then(() => undefined)
  }

  return authReadyPromise
}
