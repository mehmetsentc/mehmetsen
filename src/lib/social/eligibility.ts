/**
 * Social publishing eligibility (content + media rights) — pure.
 *
 * Replaces "an external sourceUrl alone forbids social publishing" with an
 * explicit model. Source information is never removed or rewritten:
 *
 *   1. video / live / promo / empty / no cover image  → never automatic
 *   2. editor decision `socialEligibility.status = 'blocked'` → never
 *   3. text-rights decision DO_NOT_PUBLISH / REWRITE_REQUIRED → never
 *   4. editor decision `allowed` WITH a media-rights basis → allowed
 *   5. NaHaber's own content (isOwnContent)               → allowed
 *   6. anything else (external source, no decision)       → needs review —
 *      not uploaded; the panel shows why and what to do
 *
 * Unknown / missing data never counts as allowed.
 */

export const SOCIAL_MEDIA_RIGHTS = ['own', 'licensed', 'official', 'source_permitted'] as const
export type SocialMediaRights = (typeof SOCIAL_MEDIA_RIGHTS)[number]

export const SOCIAL_MEDIA_RIGHTS_TEXT: Record<SocialMediaRights, string> = {
  own: 'Görsel NaHaber’e ait',
  licensed: 'Lisanslı / ajans aboneliği',
  official: 'Resmî kurum bülteni',
  source_permitted: 'Kaynak izin verdi',
}

export interface SocialEligibilityRecord {
  status: 'allowed' | 'blocked'
  mediaRights: SocialMediaRights | null
  note: string | null
  by: string
  at: number
}

export type EligibilityVerdict =
  | { ok: true; basis: string }
  | { ok: false; code: string; text: string; action: string }

export interface EligibilityHelpers {
  isOwnContent: (d: Record<string, unknown>) => boolean
  isSkippableForSocial: (d: Record<string, unknown>) => boolean
  extractImageUrl: (d: Record<string, unknown>) => string | undefined
}

export function readEligibilityRecord(d: Record<string, unknown>): SocialEligibilityRecord | null {
  const r = d.socialEligibility
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  if (o.status !== 'allowed' && o.status !== 'blocked') return null
  const mediaRights = (SOCIAL_MEDIA_RIGHTS as readonly string[]).includes(o.mediaRights as string) ? (o.mediaRights as SocialMediaRights) : null
  return {
    status: o.status,
    mediaRights,
    note: typeof o.note === 'string' ? o.note : null,
    by: typeof o.by === 'string' ? o.by : '',
    at: typeof o.at === 'number' ? o.at : 0,
  }
}

const no = (code: string, text: string, action: string): EligibilityVerdict => ({ ok: false, code, text, action })

export function socialEligibility(d: Record<string, unknown>, h: EligibilityHelpers): EligibilityVerdict {
  if (d.hasVideo || d.isVideo) return no('video_not_supported', 'Video haber', 'Video/Reels paylaşımı henüz desteklenmiyor')
  if (h.isSkippableForSocial(d)) return no('not_suitable', 'Canlı yayın / tanıtım / boş içerik', 'Sosyal paylaşıma uygun değil')
  if (!h.extractImageUrl(d)) return no('no_image', 'Kapak görseli yok', 'Habere kapak görseli ekleyin')
  const rec = readEligibilityRecord(d)
  if (rec?.status === 'blocked') return no('social_blocked', 'Editör sosyal yayını kapattı', 'Kararı yalnızca editör değiştirebilir')
  const rights = typeof d.rightsStatus === 'string' ? d.rightsStatus.toUpperCase() : ''
  if (rights === 'DO_NOT_PUBLISH' || rights === 'REWRITE_REQUIRED') {
    return no('rights_blocked', 'Hak kararı: yayınlanmamalı / yeniden yazılmalı', 'Önce Yayın Hakları kararını çözün')
  }
  if (rec?.status === 'allowed' && rec.mediaRights) return { ok: true, basis: `editor:${rec.mediaRights}` }
  if (h.isOwnContent(d)) return { ok: true, basis: 'own_content' }
  return no(
    'needs_social_review',
    'Harici kaynak: sosyal yayın ve görsel kullanım onayı yok',
    'Editör «Sosyal yayına uygun» olarak işaretleyip görsel hakkını seçmeli (kaynak bilgisi korunur)',
  )
}
