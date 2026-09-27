export interface ResolvedEditorRouteGeo {
  citySlug?: string | null
  districtSlug?: string | null
  countrySlug?: string | null
  forcedCitySlug?: string | null
}

export interface EditorRouteGeo {
  citySlug: string | null
  districtSlug: string | null
  countrySlug: string | null
}

function clean(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Publish-time router geography.
 * Resolved article location wins. The source outlet city is used only when
 * the article has no resolved city, district, or country.
 */
export function editorRouteGeoFromResolved(input: ResolvedEditorRouteGeo): EditorRouteGeo {
  const citySlug = clean(input.citySlug)
  const districtSlug = clean(input.districtSlug)
  const countrySlug = clean(input.countrySlug)
  const hasResolved = Boolean(citySlug || districtSlug || countrySlug)
  return {
    citySlug: hasResolved ? citySlug : clean(input.forcedCitySlug),
    districtSlug,
    countrySlug,
  }
}
