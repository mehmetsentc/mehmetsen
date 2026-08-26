const SITE_NAME = () => process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

export function articleMetaTitle(title: string, seoTitle?: string | null): string {
  const raw = (seoTitle?.trim() || title.trim() || SITE_NAME()).slice(0, 70)
  return raw
}

export function articleMetaDescription(
  summary: string | null | undefined,
  seoDescription: string | null | undefined,
  title: string
): string {
  const site = SITE_NAME()
  const desc =
    seoDescription?.trim() ||
    summary?.trim()?.slice(0, 200) ||
    `${title.trim()} — ${site}'de oku.`
  return desc.slice(0, 165)
}

export function publisherMetaTitle(displayName: string): string {
  return `${displayName} — Yayın Kuruluşu`
}

export function publisherMetaDescription(displayName: string, description?: string | null): string {
  const site = SITE_NAME()
  return (
    description?.trim() ||
    `${displayName} haberleri ve içerikleri ${site} üzerinde.`
  ).slice(0, 165)
}

export function cityMetaTitle(cityName: string): string {
  return `${cityName} Haberleri`
}

export function cityMetaDescription(cityName: string): string {
  const site = SITE_NAME()
  return `${cityName} son dakika yerel haberler, gündem ve gelişmeler. ${cityName} şehrinden en güncel haberleri ${site}'de takip edin.`.slice(
    0,
    165
  )
}

export function districtMetaTitle(districtName: string, cityName: string): string {
  return `${districtName} (${cityName}) Haberleri`
}

export function districtMetaDescription(districtName: string, cityName: string): string {
  const site = SITE_NAME()
  return `${cityName} ${districtName} ilçesi haberleri, son dakika gelişmeleri — ${site}.`.slice(0, 165)
}

export function categoryMetaTitle(categoryLabel: string): string {
  return `${categoryLabel} Haberleri`
}

export function categoryMetaDescription(categoryLabel: string): string {
  const site = SITE_NAME()
  return `${categoryLabel} kategorisindeki son haberler, analizler ve güncel gelişmeler — ${site}.`.slice(
    0,
    165
  )
}

export function topicMetaTitle(tagLabel: string): string {
  return `${tagLabel} Haberleri`
}

export function topicMetaDescription(tagLabel: string): string {
  const site = SITE_NAME()
  return `${tagLabel} etiketiyle yayınlanan son haberler, güncel gelişmeler ve arşiv — ${site}.`.slice(
    0,
    165
  )
}

export function eventMetaTitle(canonicalTitle: string): string {
  return canonicalTitle.trim().slice(0, 70)
}

export function eventMetaDescription(canonicalTitle: string, sourceCount: number): string {
  const site = SITE_NAME()
  return `${canonicalTitle.trim()} — ${sourceCount} kaynak tarafından aktarıldı. Güncel gelişmeler ${site}'de.`.slice(
    0,
    165
  )
}
