import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
} from 'firebase/auth'
import { firebaseApp } from './config'

export const auth = getAuth(firebaseApp)

let authReadyPromise: Promise<void> | null = null

/** Restores persisted Firebase session (IndexedDB → localStorage fallback). */
export function ensureAuthReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      try {
        await setPersistence(auth, indexedDBLocalPersistence)
      } catch (error) {
        console.warn('[firebase/auth] IndexedDB persistence failed, using localStorage', error)
        await setPersistence(auth, browserLocalPersistence)
      }
      await auth.authStateReady()
    })()
  }

  return authReadyPromise
}
