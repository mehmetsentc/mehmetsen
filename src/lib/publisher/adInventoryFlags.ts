/** Publisher ad inventory feature flags — prod default false. */

function flag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** Studio inventory builder + CRUD. */
export function isPublisherAdInventoryEnabled(): boolean {
  return flag('PUBLISHER_AD_INVENTORY_ENABLED')
}

/** Public “satışa açık” placeholders + media kit. */
export function isPublisherAdPublicListingEnabled(): boolean {
  return flag('PUBLISHER_AD_PUBLIC_LISTING_ENABLED')
}

/** Profile layout AD_SLOT rendering. */
export function isProfileAdSlotsEnabled(): boolean {
  return flag('PROFILE_AD_SLOTS_ENABLED')
}

/** Article BEFORE/MID/AFTER_BODY placeholders. */
export function isArticleAdSlotsEnabled(): boolean {
  return flag('ARTICLE_AD_SLOTS_ENABLED')
}
