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

/**
 * VIDEO_LIBRARY_IMPORT_ENABLED — default false.
 * Requires VIDEO_LIBRARY_ENABLED. Does not publish.
 */
export function isVideoLibraryImportEnabled(): boolean {
  if (!isVideoLibraryEnabled()) return false
  const env = parseTriState(process.env.VIDEO_LIBRARY_IMPORT_ENABLED)
  if (env !== null) return env
  return false
}

export function videoLibraryMaxBytes(): number {
  const raw = Number(process.env.VIDEO_LIBRARY_MAX_BYTES)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 2_147_483_647)
  return 100 * 1024 * 1024
}
