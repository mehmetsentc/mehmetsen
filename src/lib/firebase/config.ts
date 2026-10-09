// TODO: Implement in Phase 1 — Firebase app initialization
import { initializeApp, getApps, getApp } from 'firebase/app'
import { firebaseTargetProblem, SmmTestFirebaseGuardError } from '@/lib/social/testEnvironment'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// SMM test önizlemesi: istemci production Firebase'e (Auth/Firestore) bağlanmaz.
// NEXT_PUBLIC_* değerler derlemede gömülür; sistem değişkenleri (VERCEL_ENV,
// VERCEL_GIT_COMMIT_REF) NEXT_PUBLIC_ önekiyle Vercel tarafından sağlanır.
const smmClientProblem = firebaseTargetProblem(
  { projectId: firebaseConfig.projectId, bucket: firebaseConfig.storageBucket, credential: 'client' },
  {
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
    SOCIAL_TEST_MODE: process.env.NEXT_PUBLIC_SOCIAL_TEST_MODE,
    NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_SOCIAL_TEST_FIREBASE_PROJECT_ID,
    SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS: process.env.NEXT_PUBLIC_SOCIAL_PRODUCTION_FIREBASE_PROJECT_IDS,
  },
)
if (smmClientProblem) throw new SmmTestFirebaseGuardError(smmClientProblem)

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
