import {
  DEFAULT_CMS_FEATURE_FLAGS,
  type CmsFeatureFlagKey,
  type CmsFeatureFlags,
} from '@/types/newsroomOs'

export const SITE_SETTINGS_DOC_ID = 'global'

export interface SiteSocialLinks {
  x: string
  facebook: string
  instagram: string
  youtube: string
}

export interface SiteSettings {
  siteName: string
  tagline: string
  description: string
  contactEmail: string
  social: SiteSocialLinks
  notificationsEnabled: boolean
  analyticsEnabled: boolean
  cmsFlags: CmsFeatureFlags
  updatedAt: number | null
  updatedBy: string | null
}

export const CMS_FLAG_LABELS: Record<CmsFeatureFlagKey, string> = {
  aiNewsroomEnabled: 'AI Newsroom',
  learningEngineEnabled: 'Öğrenme motoru',
  algorithmAgentEnabled: 'Algoritma ajanı',
  socialAutomationEnabled: 'Sosyal otomasyon',
  autoPublishEnabled: 'Otomatik yayın',
  pageBuilderEnabled: 'Sayfa oluşturucu',
  scopedRbacEnabled: 'Kapsamlı yetkiler',
  smmNetworkEnabled: '81 il SMM ağı',
}

export function defaultSiteSettings(): SiteSettings {
  return {
    siteName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber',
    tagline: 'Dijital Gazete — Türkiye',
    description:
      'Türkiye\'nin anlık haber platformu. Son dakika haberler, spor, teknoloji, ekonomi, dünya ve yerel haberler NaHaber\'de.',
    contactEmail: 'bilgi@nahaber.com',
    social: {
      x: process.env.NEXT_PUBLIC_X_URL?.trim() || 'https://x.com/nahabercom',
      facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL?.trim() || 'https://www.facebook.com/nahabercom',
      instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || 'https://www.instagram.com/nahabercom',
      youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL?.trim() || 'https://www.youtube.com/@nahabercom',
    },
    notificationsEnabled: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true',
    analyticsEnabled: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    cmsFlags: { ...DEFAULT_CMS_FEATURE_FLAGS },
    updatedAt: null,
    updatedBy: null,
  }
}

function cleanText(value: unknown, fallback: string, max = 240): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return fallback
  return trimmed.slice(0, max)
}

function cleanUrl(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return fallback
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

function cleanEmail(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 120) return fallback
  return raw
}

export function sanitizeSiteSettings(raw: Partial<SiteSettings> | null | undefined): SiteSettings {
  const defaults = defaultSiteSettings()
  const socialIn = raw?.social ?? defaults.social
  const flagsIn = raw?.cmsFlags ?? defaults.cmsFlags

  const cmsFlags = { ...DEFAULT_CMS_FEATURE_FLAGS }
  for (const key of Object.keys(DEFAULT_CMS_FEATURE_FLAGS) as CmsFeatureFlagKey[]) {
    cmsFlags[key] = typeof flagsIn[key] === 'boolean' ? flagsIn[key] : DEFAULT_CMS_FEATURE_FLAGS[key]
  }

  return {
    siteName: cleanText(raw?.siteName, defaults.siteName, 80),
    tagline: cleanText(raw?.tagline, defaults.tagline, 80),
    description: cleanText(raw?.description, defaults.description, 320),
    contactEmail: cleanEmail(raw?.contactEmail, defaults.contactEmail),
    social: {
      x: cleanUrl(socialIn.x, defaults.social.x),
      facebook: cleanUrl(socialIn.facebook, defaults.social.facebook),
      instagram: cleanUrl(socialIn.instagram, defaults.social.instagram),
      youtube: cleanUrl(socialIn.youtube, defaults.social.youtube),
    },
    notificationsEnabled: typeof raw?.notificationsEnabled === 'boolean'
      ? raw.notificationsEnabled
      : defaults.notificationsEnabled,
    analyticsEnabled: typeof raw?.analyticsEnabled === 'boolean'
      ? raw.analyticsEnabled
      : defaults.analyticsEnabled,
    cmsFlags,
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : defaults.updatedAt,
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : defaults.updatedBy,
  }
}

export function socialUrlList(social: SiteSocialLinks): string[] {
  return [social.x, social.facebook, social.instagram, social.youtube].filter(Boolean)
}
