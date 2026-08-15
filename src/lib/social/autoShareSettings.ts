/**
 * Global otomatik paylaşım bayrakları.
 * Firestore: config/socialAutoShare
 *
 * Cron ve CMS "yayınlanınca anlık" bu bayrakları okur.
 * Manuel admin paylaşımı (composer / Haberler butonları) etkilenmez.
 */
export interface SocialAutoShareSettings {
  /** Cron şehir feed post batch açık mı? */
  autoPost: boolean
  /** Cron hikâye batch açık mı? */
  autoStory: boolean
  /**
   * CMS'de haber yayınlanınca / öne çıkan olunca anında publishOneSocial çalışsın mı?
   * Kapalıysa yalnızca cron (ve manuel) paylaşır.
   */
  autoOnPublish: boolean
  /**
   * Eski Meta Llama caption rewrite. Overlay/caption artık DeepSeek.
   * Kod yolu kapalı (isMetaAiRewriteEnabled = false).
   */
  metaAiRewrite: boolean
  /**
   * Cron auto-post için dahil iller (citySlug).
   * Boş / tanımsız → ['canakkale'] (mevcut production hattı).
   */
  enabledCitySlugs: string[]
  updatedAt?: unknown
  updatedBy?: string
}

export const DEFAULT_AUTO_SHARE_CITY_SLUGS = ['canakkale'] as const

export const DEFAULT_AUTO_SHARE_SETTINGS: SocialAutoShareSettings = {
  autoPost: true,
  autoStory: true,
  autoOnPublish: true,
  metaAiRewrite: false,
  enabledCitySlugs: [...DEFAULT_AUTO_SHARE_CITY_SLUGS],
}

function normalizeCitySlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_AUTO_SHARE_CITY_SLUGS]
  const cleaned = [
    ...new Set(
      raw
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  return cleaned.length > 0 ? cleaned : [...DEFAULT_AUTO_SHARE_CITY_SLUGS]
}

export function normalizeAutoShareSettings(raw: unknown): SocialAutoShareSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    autoPost: r.autoPost !== false,
    autoStory: r.autoStory !== false,
    autoOnPublish: r.autoOnPublish !== false,
    metaAiRewrite: r.metaAiRewrite !== false,
    enabledCitySlugs: normalizeCitySlugs(r.enabledCitySlugs),
    ...(r.updatedAt !== undefined ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === 'string' ? { updatedBy: r.updatedBy } : {}),
  }
}
