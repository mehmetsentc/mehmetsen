import { isCmsFeatureEnabled } from '@/lib/cms/featureFlags'

function parseTriState(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return null
}

/**
 * MEDIA_STUDIO_ENABLED — on unless an env value turns it off.
 * Env wins when set; otherwise CMS flag `mediaStudioEnabled`.
 */
export function isMediaStudioEnabled(): boolean {
  const env =
    parseTriState(process.env.MEDIA_STUDIO_ENABLED) ??
    parseTriState(process.env.NEXT_PUBLIC_MEDIA_STUDIO_ENABLED)
  if (env !== null) return env
  return isCmsFeatureEnabled('mediaStudioEnabled')
}
