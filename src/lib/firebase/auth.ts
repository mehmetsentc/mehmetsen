import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import { firebaseApp } from './config'

function createAuth(): Auth {
  if (typeof window === 'undefined') {
    return getAuth(firebaseApp)
  }

  try {
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    })
  } catch {
    // Hot reload or duplicate init — reuse existing instance.
    return getAuth(firebaseApp)
  }
}

export const auth = createAuth()

let authReadyPromise: Promise<void> | null = null

/** Waits until Firebase restores any persisted session. */
export function ensureAuthReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (!authReadyPromise) {
    authReadyPromise = auth.authStateReady().then(() => undefined)
  }

  return authReadyPromise
}
