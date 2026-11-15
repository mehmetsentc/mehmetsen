import { PROVINCE_REGION_BY_SLUG } from '../provinceRegions'
import type { NewsSourceRecord } from '../types'
import { locateSondakikaArticle } from './locate'
import { isSondakikaCitySource } from './registry'

export interface RawArticleGeo {
  region: string | null
  city: string | null
  district: string | null
}

/**
 * Ham haber kaydının bölge/il/ilçesi.
 *  - Diğer kaynaklar: değişmez, kaynağın kendi değerleri (önceki davranış birebir).
 *  - sondakika il kaynakları: metinden tespit. Ulusal ya da il bulunamayan haber
 *    il sayfasının iline YAZILMAZ (yanlış il haberi göstermektense boş bırakılır).
 */
export function resolveRawArticleGeo(
  source: Pick<NewsSourceRecord, 'registryKey' | 'domain' | 'region' | 'city' | 'district'>,
  article: { title: string | null; description: string | null; articleBodyText: string | null }
): RawArticleGeo {
  if (!isSondakikaCitySource(source)) {
    return { region: source.region, city: source.city, district: source.district }
  }
  const loc = locateSondakikaArticle({
    title: article.title,
    description: article.description,
    body: article.articleBodyText,
  })
  if (!loc.provinceSlug || loc.likelyNational) {
    return { region: null, city: null, district: null }
  }
  return {
    region: PROVINCE_REGION_BY_SLUG[loc.provinceSlug] ?? null,
    city: loc.provinceName,
    district: loc.districtName,
  }
}
