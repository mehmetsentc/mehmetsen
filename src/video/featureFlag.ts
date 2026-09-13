import { isCmsFeatureEnabled } from '@/lib/cms/featureFlags'

function parseTriState(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return null
}

/**
 * VIDEO_LIBRARY_ENABLED — default false.
 * Env wins when set; otherwise CMS flag `videoLibraryEnabled` (also default false).
 */
export function isVideoLibraryEnabled(): boolean {
  const env =
    parseTriState(process.env.VIDEO_LIBRARY_ENABLED) ??
    parseTriState(process.env.NEXT_PUBLIC_VIDEO_LIBRARY_ENABLED)
  if (env !== null) return env
  return isCmsFeatureEnabled('videoLibraryEnabled')
}
