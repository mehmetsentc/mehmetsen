import type { SocialPublishPayload } from './types'
import { socialLog } from './safeLog'

/**
 * Görsel biçim politikası (Görev 5).
 *
 * Facebook ve Threads adaptörleri yalnızca TEK görselli gönderi uygular.
 * Çoklu görsel taşıyan bir payload bu adaptörlere ulaşırsa sessizce ilk
 * görsele düşürülmez: adaptör, medya hazırlığı ve platform isteğinden önce
 * `multi_image_unsupported` ile reddeder.
 *
 * Tek görselle yayın yalnızca iki durumda yapılır:
 *  - Kullanıcı composer'da açıkça "tek görsel" seçmiştir (imageMode: 'single').
 *  - Biçim seçimi olmayan mevcut tetikleyiciler (cron, CMS after(), toplu
 *    yeniden paylaşım, eski API uçları) bu platformlar için kapak görselini
 *    `singleCoverPayload` ile AÇIKÇA tek görsel olarak işaretler ve bunu loglar.
 */

export type SingleImagePlatform = 'facebook' | 'threads'

export const MULTI_IMAGE_TEXT: Record<SingleImagePlatform, string> = {
  facebook: 'Facebook çoklu görsel gönderi desteklenmiyor; görseller tek görsele düşürülmedi — tek görsel seçip tekrar deneyin. Yayın yapılmadı.',
  threads: 'Threads çoklu görsel gönderi desteklenmiyor; görseller tek görsele düşürülmedi — tek görsel seçip tekrar deneyin. Yayın yapılmadı.',
}

export const CAROUSEL_TEXT: Record<SingleImagePlatform, string> = {
  facebook: 'Facebook kaydırmalı (çoklu görsel) gönderi desteklenmiyor — yayın yapılmadı',
  threads: 'Threads kaydırmalı (çoklu görsel) gönderi desteklenmiyor — yayın yapılmadı',
}

function nonEmpty(urls: readonly (string | undefined | null)[] | undefined): string[] {
  return (urls ?? []).map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
}

/**
 * Tek görsel uygulayan adaptör için ön kontrol. Hata varsa platform isteği
 * yapılmadan döndürülecek sonucu verir; yoksa null.
 */
export function singleImageGuard(
  payload: Pick<SocialPublishPayload, 'imageMode' | 'imageUrls'>,
  platform: SingleImagePlatform,
): { success: false; code: 'carousel_unsupported' | 'multi_image_unsupported'; error: string } | null {
  if (payload.imageMode === 'carousel') {
    return { success: false, code: 'carousel_unsupported', error: CAROUSEL_TEXT[platform] }
  }
  if (payload.imageMode !== 'single' && nonEmpty(payload.imageUrls).length >= 2) {
    return { success: false, code: 'multi_image_unsupported', error: MULTI_IMAGE_TEXT[platform] }
  }
  return null
}

/**
 * Biçim seçimi olmayan tetikleyiciler için: kapak görselini açıkça tek görsel
 * olarak işaretler. Kullanıcının açıkça kaydırmalı istediği payload'a
 * UYGULANMAZ (o durumda adaptör reddeder).
 */
export function singleCoverPayload(
  payload: SocialPublishPayload,
  platform: SingleImagePlatform,
): SocialPublishPayload {
  if (payload.imageMode === 'carousel' || payload.imageMode === 'single') return payload
  const urls = nonEmpty(payload.imageUrls)
  if (urls.length < 2) return payload
  const cover = payload.imageUrl?.trim() || urls[0]
  socialLog('log', platform, 'image_policy', {
    corr: payload.newsId,
    result: 'single_cover',
    slides: urls.length,
  })
  const { imageUrls: _omit, ...rest } = payload
  void _omit
  return { ...rest, imageUrl: cover, imageMode: 'single' }
}
