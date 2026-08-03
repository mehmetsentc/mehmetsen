/**
 * Server-only: Firestore config/socialAutoShare okuma.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  DEFAULT_AUTO_SHARE_SETTINGS,
  normalizeAutoShareSettings,
  type SocialAutoShareSettings,
} from './autoShareSettings'

const DOC_PATH = { collection: 'config', id: 'socialAutoShare' } as const

let cache: { settings: SocialAutoShareSettings; at: number } | null = null
const CACHE_TTL_MS = 30_000

export function invalidateAutoShareSettingsCache() {
  cache = null
}

export async function getAutoShareSettings(): Promise<SocialAutoShareSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.settings
  try {
    const db = getAdminFirestore()
    const snap = await db.collection(DOC_PATH.collection).doc(DOC_PATH.id).get()
    const settings = normalizeAutoShareSettings(snap.exists ? snap.data() : null)
    cache = { settings, at: Date.now() }
    return settings
  } catch (err) {
    console.warn('[autoShareSettingsStore] read failed, using defaults:', err)
    return { ...DEFAULT_AUTO_SHARE_SETTINGS }
  }
}
