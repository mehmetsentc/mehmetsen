/**
 * Global otomatik paylaşım bayrakları.
 * Firestore: config/socialAutoShare
 *
 * Cron ve CMS "yayınlanınca anlık" bu bayrakları okur.
 * Manuel admin paylaşımı (composer / Haberler butonları) etkilenmez.
 */
export interface SocialAutoShareSettings {
  /** Cron Çanakkale feed post batch açık mı? */
  autoPost: boolean
  /** Cron hikâye batch açık mı? */
  autoStory: boolean
  /**
   * CMS'de haber yayınlanınca / öne çıkan olunca anında publishOneSocial çalışsın mı?
   * Kapalıysa yalnızca cron (ve manuel) paylaşır.
   */
  autoOnPublish: boolean
  /**
   * Facebook foto paylaşımından önce Meta Llama ile özgün caption üret.
   * Varsayılan: açık. Timeout/fail → yerel fallback (yine photos endpoint).
   */
  metaAiRewrite: boolean
  updatedAt?: unknown
  updatedBy?: string
}

export const DEFAULT_AUTO_SHARE_SETTINGS: SocialAutoShareSettings = {
  autoPost: true,
  autoStory: true,
  autoOnPublish: true,
  metaAiRewrite: true,
}

export function normalizeAutoShareSettings(raw: unknown): SocialAutoShareSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    autoPost: r.autoPost !== false,
    autoStory: r.autoStory !== false,
    autoOnPublish: r.autoOnPublish !== false,
    metaAiRewrite: r.metaAiRewrite !== false,
    ...(r.updatedAt !== undefined ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === 'string' ? { updatedBy: r.updatedBy } : {}),
  }
}
