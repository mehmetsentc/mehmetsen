import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getStorage, type Storage } from 'firebase-admin/storage'
import { Collections } from '@/lib/firebase/collections'

let adminApp: App | undefined
let adminDb: Firestore | undefined
let adminAuth: Auth | undefined
let adminStorage: Storage | undefined

function readServiceAccountFromEnv():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as {
        project_id?: string
        client_email?: string
        private_key?: string
      }
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }
      }
    } catch {
      // fall through to discrete env vars
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  return null
}

function getAdminApp(): App {
  if (adminApp) return adminApp
  if (getApps().length > 0) {
    adminApp = getApps()[0]!
    return adminApp
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    undefined

  const serviceAccount = readServiceAccountFromEnv()
  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
      ...(storageBucket ? { storageBucket } : {}),
    })
    return adminApp
  }

  // GOOGLE_APPLICATION_CREDENTIALS or GCP default credentials (Cloud Functions, etc.)
  adminApp = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || process.env.GCLOUD_PROJECT,
    ...(storageBucket ? { storageBucket } : {}),
  })
  return adminApp
}

/** Server-only Firestore client (bypasses security rules). */
export function getAdminFirestore(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp())
    try {
      adminDb.settings({ ignoreUndefinedProperties: true })
    } catch {
      // settings() throws if already initialized elsewhere — safe to ignore
    }
  }
  return adminDb
}

/** Server-only Auth client for verifying admin ID tokens. */
export function getAdminAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(getAdminApp())
  return adminAuth
}

/** Server-only Storage client (bypasses security rules). */
export function getAdminStorage(): Storage {
  if (!adminStorage) adminStorage = getStorage(getAdminApp())
  return adminStorage
}

export { Collections }
