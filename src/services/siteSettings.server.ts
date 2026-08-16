import 'server-only'
import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  SITE_SETTINGS_DOC_ID,
  defaultSiteSettings,
  sanitizeSiteSettings,
  type SiteSettings,
} from '@/lib/siteSettings'

function docRef() {
  return getAdminFirestore().collection(Collections.SITE_SETTINGS).doc(SITE_SETTINGS_DOC_ID)
}

async function readSiteSettings(): Promise<SiteSettings> {
  try {
    const snap = await docRef().get()
    if (!snap.exists) return defaultSiteSettings()
    return sanitizeSiteSettings(snap.data() as Partial<SiteSettings>)
  } catch {
    return defaultSiteSettings()
  }
}

const getSiteSettingsCached = unstable_cache(
  readSiteSettings,
  ['site-settings-global-v1'],
  { revalidate: 120, tags: ['site-settings'] }
)

export async function getSiteSettings(): Promise<SiteSettings> {
  return getSiteSettingsCached()
}

export async function saveSiteSettings(
  patch: Partial<SiteSettings>,
  updatedBy: string | null
): Promise<SiteSettings> {
  const current = await readSiteSettings()
  const next = sanitizeSiteSettings({
    ...current,
    ...patch,
    social: { ...current.social, ...(patch.social ?? {}) },
    cmsFlags: { ...current.cmsFlags, ...(patch.cmsFlags ?? {}) },
    updatedAt: Date.now(),
    updatedBy,
  })
  await docRef().set(next, { merge: true })
  return next
}
