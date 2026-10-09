/**
 * Publishable formats = PLATFORM capability ∩ NaHaber ADAPTER implementation.
 * Pure — shared by the composer UI and server-side validation (both apply the
 * same intersection, so the UI never offers what the server would refuse).
 *
 * Platform capability (Meta docs; what the account type could do):
 *   Facebook Page: photo post, multi-photo post, photo story, video, reel.
 *   Instagram professional (Facebook Login / legacy business account, or
 *     Instagram Login with a reported BUSINESS / MEDIA_CREATOR type):
 *     image, carousel, story, reel (video publishes as reel).
 *   Instagram Login with an unknown / unreported type: image, carousel only —
 *     no story is offered while the professional type is unverified.
 *   Threads: image, carousel, video, text. No story.
 *
 * Adapter implementation (what NaHaber's code actually publishes today):
 *   Facebook: single photo post, photo story. NO multi-photo / reel / video.
 *   Instagram: single image, carousel, story. NO reel / video.
 *   Threads: single image (+ text fallback). NO carousel / video.
 */
import type { SocialAccountPlatform, SocialConnectionMethod, SocialAccountStatus, PublishPermissionState } from './types'

export type PublishFormat = 'post' | 'story'
export type ComposerMode = 'post' | 'story' | 'both'

export type ContentKind = 'image_post' | 'carousel_post' | 'story' | 'reel' | 'video'
/** Composer image choice for a post. `carousel` never silently degrades to one image. */
export type ImageMode = 'single' | 'carousel'

const PROFESSIONAL_IG_TYPES = new Set(['BUSINESS', 'MEDIA_CREATOR'])

type CapabilityInput = {
  platform: SocialAccountPlatform
  connectionMethod: SocialConnectionMethod
  platformAccountType: string | null
}

/** What the platform supports for this account type (docs), independent of NaHaber's code. */
export function platformCapabilities(a: CapabilityInput): ContentKind[] {
  if (a.platform === 'threads') return ['image_post', 'carousel_post', 'video']
  if (a.platform === 'facebook') return ['image_post', 'carousel_post', 'story', 'video', 'reel']
  if (a.connectionMethod === 'instagram_login') {
    const professional = !!a.platformAccountType && PROFESSIONAL_IG_TYPES.has(a.platformAccountType.toUpperCase())
    return professional ? ['image_post', 'carousel_post', 'story', 'reel'] : ['image_post', 'carousel_post']
  }
  // Instagram via Facebook Login / legacy: the Graph API only exposes
  // professional accounts linked to a Page.
  return ['image_post', 'carousel_post', 'story', 'reel']
}

/** What NaHaber's adapters implement today. Reels / video: nowhere. */
export const ADAPTER_IMPLEMENTED: Record<SocialAccountPlatform, readonly ContentKind[]> = {
  facebook: ['image_post', 'story'],
  instagram: ['image_post', 'carousel_post', 'story'],
  threads: ['image_post'],
}

/** Selectable kinds = platform capability ∩ adapter implementation. */
export function publishableKinds(a: CapabilityInput): ContentKind[] {
  const impl = ADAPTER_IMPLEMENTED[a.platform] ?? []
  return platformCapabilities(a).filter((k) => impl.includes(k))
}

export function supportedFormats(a: CapabilityInput): PublishFormat[] {
  const kinds = publishableKinds(a)
  const out: PublishFormat[] = []
  if (kinds.includes('image_post')) out.push('post')
  if (kinds.includes('story')) out.push('story')
  return out
}

/**
 * Carousel is allowed only when EVERY post platform in the request publishes
 * carousels (adapter ∩ platform). Platform-level (legacy accounts) check uses
 * the adapter list; account-level checks use publishableKinds.
 */
export function platformImplementsCarousel(platform: SocialAccountPlatform): boolean {
  return (ADAPTER_IMPLEMENTED[platform] ?? []).includes('carousel_post')
}

export function imageModeProblem(
  imageMode: ImageMode | undefined,
  postPlatforms: SocialAccountPlatform[],
): 'carousel_unsupported' | null {
  if (imageMode !== 'carousel') return null
  if (postPlatforms.length === 0) return null
  return postPlatforms.every(platformImplementsCarousel) ? null : 'carousel_unsupported'
}

export function parseImageMode(v: unknown): ImageMode | undefined | 'invalid' {
  if (v === undefined || v === null || v === '') return undefined
  return v === 'single' || v === 'carousel' ? v : 'invalid'
}

/** Formats a composer mode requires from one platform's target. Threads never posts stories. */
export function requiredFormats(platform: SocialAccountPlatform, mode: ComposerMode): PublishFormat[] {
  if (platform === 'threads') return mode === 'story' ? ['story'] : ['post']
  if (mode === 'both') return ['post', 'story']
  return [mode]
}

export type TargetBlocker =
  | 'status_paused'
  | 'status_needs_reauth'
  | 'status_disabled'
  | 'token_expired'
  | 'publish_permission_missing'
  | 'publish_permission_unverified'
  | 'format_unsupported'

/** Why an account can't be a publish target for this mode (null = selectable). */
export function targetBlocker(
  a: {
    platform: SocialAccountPlatform
    connectionMethod: SocialConnectionMethod
    platformAccountType: string | null
    status: SocialAccountStatus
    tokenExpiresAt: number | null
    publishPermission: PublishPermissionState
  },
  mode: ComposerMode,
  now: number,
): TargetBlocker | null {
  if (a.status !== 'active') return `status_${a.status}` as TargetBlocker
  if (a.tokenExpiresAt !== null && a.tokenExpiresAt <= now) return 'token_expired'
  if (a.publishPermission === 'missing') return 'publish_permission_missing'
  if (a.publishPermission === 'unverified') return 'publish_permission_unverified'
  const supported = supportedFormats(a)
  if (!requiredFormats(a.platform, mode).every((f) => supported.includes(f))) return 'format_unsupported'
  return null
}

export const TARGET_BLOCKER_TEXT: Record<TargetBlocker, string> = {
  status_paused: 'duraklatıldı',
  status_needs_reauth: 'yeniden bağlantı gerekli',
  status_disabled: 'devre dışı',
  token_expired: 'erişim süresi dolmuş',
  publish_permission_missing: 'yayın izni eksik',
  publish_permission_unverified: 'yayın izni doğrulanmadı',
  format_unsupported: 'bu biçim desteklenmiyor',
}
