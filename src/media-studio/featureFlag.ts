import { isCmsFeatureEnabled } from '@/lib/cms/featureFlags'

function parseTriState(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return null
}

/**
 * MEDIA_STUDIO_ENABLED — default false.
 * Env wins when set; otherwise CMS flag `mediaStudioEnabled` (also default false).
 * Client surfaces (sidebar) read NEXT_PUBLIC_MEDIA_STUDIO_ENABLED.
 * Does not download, store, or publish anything.
 */
export function isMediaStudioEnabled(): boolean {
  const env =
    parseTriState(process.env.MEDIA_STUDIO_ENABLED) ??
    parseTriState(process.env.NEXT_PUBLIC_MEDIA_STUDIO_ENABLED)
  if (env !== null) return env
  return isCmsFeatureEnabled('mediaStudioEnabled')
}
