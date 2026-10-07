import type { AdDisplayTheme } from '@/lib/solarTime'
import type { AdBanner, AdBannerPublic } from '@/types/adBanner'

export function isAdBannerActive(banner: Pick<AdBanner, 'active' | 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  if (!banner.active) return false
  if (banner.startsAt) {
    const start = Date.parse(banner.startsAt)
    if (Number.isFinite(start) && now < start) return false
  }
  if (banner.endsAt) {
    const end = Date.parse(banner.endsAt)
    if (Number.isFinite(end) && now > end) return false
  }
  return true
}

export function toPublicAdBanner(banner: AdBanner): AdBannerPublic {
  return {
    id: banner.id,
    slotId: banner.slotId,
    format: banner.format,
    size: banner.size,
    imageUrl: banner.imageUrl,
    imageUrlLight: banner.imageUrlLight,
    imageUrlDark: banner.imageUrlDark,
    videoUrl: banner.videoUrl,
    htmlContent: banner.htmlContent,
    clickUrl: banner.clickUrl,
    altText: banner.altText,
  }
}

export function resolveAdImageUrl(
  ad: Pick<AdBannerPublic, 'imageUrl' | 'imageUrlLight' | 'imageUrlDark'>,
  theme: AdDisplayTheme
): string | null {
  if (theme === 'light') {
    return ad.imageUrlLight?.trim() || ad.imageUrl?.trim() || null
  }
  const dark = ad.imageUrlDark?.trim()
  if (dark) return dark
  // Açık tema görseli yüklüyse koyu temada karşıt görsel gösterme
  if (ad.imageUrlLight?.trim()) return null
  return ad.imageUrl?.trim() || null
}

export function hasAdImageContent(
  ad: Pick<AdBannerPublic, 'imageUrl' | 'imageUrlLight' | 'imageUrlDark'>
): boolean {
  return Boolean(ad.imageUrl?.trim() || ad.imageUrlLight?.trim() || ad.imageUrlDark?.trim())
}

/** Phase 2: page geo context for local (il/ilçe) ads. */
export interface AdGeoContext {
  citySlug?: string | null
  districtSlug?: string | null
}

/** Legacy banners have no status → approved. */
export function isAdBannerApproved(banner: Pick<AdBanner, 'status'>): boolean {
  return (banner.status ?? 'approved') === 'approved'
}

/** National banners match everywhere; local banners only on their il (and ilçe). */
export function adBannerMatchesGeo(banner: Pick<AdBanner, 'provinceSlug' | 'districtSlug'>, geo: AdGeoContext = {}): boolean {
  if (!banner.provinceSlug) return true
  if (!geo.citySlug || geo.citySlug !== banner.provinceSlug) return false
  return !banner.districtSlug || geo.districtSlug === banner.districtSlug
}

function geoSpecificity(banner: Pick<AdBanner, 'provinceSlug' | 'districtSlug'>): number {
  if (banner.districtSlug) return 2
  return banner.provinceSlug ? 1 : 0
}

/** Aynı slota birden fazla banner — en özel (ilçe > il > ulusal), sonra en yüksek priority kazanır */
export function pickBestBannerForSlot(banners: AdBanner[], slotId: string, geo: AdGeoContext = {}): AdBanner | null {
  const now = Date.now()
  const matching = banners.filter((b) => {
    if (!isAdBannerActive(b, now)) return false
    if (!isAdBannerApproved(b)) return false
    if (!adBannerMatchesGeo(b, geo)) return false
    if (b.slotId === slotId) return true
    // category-all-* fallback for specific category slots
    if (b.slotId.startsWith('category-all-')) {
      const pos = b.slotId.replace('category-all-', '')
      return slotId.endsWith(`-${pos}`)
    }
    return false
  })

  if (matching.length === 0) return null
  return (
    matching.sort((a, b) => geoSpecificity(b) - geoSpecificity(a) || b.priority - a.priority)[0] ?? null
  )
}

export function docToAdBanner(id: string, raw: Record<string, unknown>): AdBanner {
  const ts = (v: unknown): string => {
    if (v == null) return new Date().toISOString()
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
      return (v as { toDate: () => Date }).toDate().toISOString()
    }
    return new Date().toISOString()
  }

  return {
    id,
    name: String(raw.name ?? ''),
    slotId: String(raw.slotId ?? ''),
    page: (raw.page as AdBanner['page']) ?? 'home',
    categoryId: raw.categoryId != null ? String(raw.categoryId) : null,
    position: (raw.position as AdBanner['position']) ?? 'top',
    format: (raw.format as AdBanner['format']) ?? 'image',
    size: (raw.size as AdBanner['size']) ?? 'leaderboard',
    imageUrl: raw.imageUrl != null ? String(raw.imageUrl) : null,
    imageUrlLight: raw.imageUrlLight != null ? String(raw.imageUrlLight) : null,
    imageUrlDark: raw.imageUrlDark != null ? String(raw.imageUrlDark) : null,
    videoUrl: raw.videoUrl != null ? String(raw.videoUrl) : null,
    htmlContent: raw.htmlContent != null ? String(raw.htmlContent) : null,
    clickUrl: raw.clickUrl != null ? String(raw.clickUrl) : null,
    altText: raw.altText != null ? String(raw.altText) : null,
    active: raw.active !== false,
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    startsAt: raw.startsAt != null ? ts(raw.startsAt) : null,
    endsAt: raw.endsAt != null ? ts(raw.endsAt) : null,
    createdAt: ts(raw.createdAt),
    updatedAt: ts(raw.updatedAt),
    createdBy: raw.createdBy != null ? String(raw.createdBy) : null,
    provinceSlug: typeof raw.provinceSlug === 'string' && raw.provinceSlug ? raw.provinceSlug : null,
    districtSlug: typeof raw.districtSlug === 'string' && raw.districtSlug ? raw.districtSlug : null,
    status: raw.status === 'pending' || raw.status === 'rejected' ? raw.status : 'approved',
    submittedByUid: typeof raw.submittedByUid === 'string' ? raw.submittedByUid : null,
    reviewedBy: typeof raw.reviewedBy === 'string' ? raw.reviewedBy : null,
  }
}
