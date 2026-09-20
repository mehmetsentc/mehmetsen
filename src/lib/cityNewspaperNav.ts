/** Keep `?tenant=` on localhost so category clicks stay on the city site. */
export function withCityTenantHref(href: string, tenantSlug?: string | null) {
  if (!tenantSlug) return href
  const [path, hash = ''] = href.split('#')
  const [pathname, existing = ''] = path.split('?')
  const params = new URLSearchParams(existing)
  params.set('tenant', tenantSlug)
  const query = params.toString()
  return `${pathname}?${query}${hash ? `#${hash}` : ''}`
}

/** Same 12 links as national NEWSPAPER_NAV — city /kategori rewrites only. */
export const CITY_NEWSPAPER_NAV = [
  { id: 'feed', label: 'Ana Sayfa', href: '/' },
  { id: 'gundem', label: 'Gündem', href: '/kategori/gundem' },
  { id: 'yerel', label: 'Yerel', href: '/kategori/yerel-haber' },
  { id: 'asayis', label: '3. Sayfa', href: '/kategori/asayis' },
  { id: 'dunya', label: 'Dünya', href: '/kategori/dunya' },
  { id: 'siyaset', label: 'Siyaset', href: '/kategori/siyaset' },
  { id: 'ekonomi', label: 'Ekonomi', href: '/kategori/ekonomi' },
  { id: 'spor', label: 'Spor', href: '/kategori/spor' },
  { id: 'teknoloji', label: 'Teknoloji', href: '/kategori/teknoloji' },
  { id: 'kultur', label: 'Kültür', href: '/kategori/kultur' },
  { id: 'saglik', label: 'Sağlık', href: '/kategori/saglik' },
  { id: 'video', label: 'Video', href: '/kategori/video' },
] as const
