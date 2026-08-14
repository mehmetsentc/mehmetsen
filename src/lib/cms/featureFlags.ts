/**
 * CMS feature flags — server/client safe defaults.
 * Production overrides via NEXT_PUBLIC_CMS_FLAGS JSON or Firestore doc (later).
 */
import {
  DEFAULT_CMS_FEATURE_FLAGS,
  type CmsFeatureFlagKey,
  type CmsFeatureFlags,
} from '@/types/newsroomOs'

function parseEnvFlags(): Partial<CmsFeatureFlags> {
  const raw = process.env.NEXT_PUBLIC_CMS_FLAGS
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Partial<CmsFeatureFlags>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getCmsFeatureFlags(
  overrides?: Partial<CmsFeatureFlags> | null
): CmsFeatureFlags {
  return {
    ...DEFAULT_CMS_FEATURE_FLAGS,
    ...parseEnvFlags(),
    ...(overrides ?? {}),
  }
}

export function isCmsFeatureEnabled(
  key: CmsFeatureFlagKey,
  overrides?: Partial<CmsFeatureFlags> | null
): boolean {
  return getCmsFeatureFlags(overrides)[key] === true
}
