export type ProfileContentTab = 'posts' | 'reels' | 'saved' | 'liked'

const OWNER_ONLY: ReadonlySet<ProfileContentTab> = new Set(['saved', 'liked'])

export function isOwnerOnlyProfileTab(tab: ProfileContentTab): boolean {
  return OWNER_ONLY.has(tab)
}

/** Visitors never stay on saved/liked, including a persisted tab from their own profile. */
export function resolveProfileTab(active: ProfileContentTab, isOwnProfile: boolean): ProfileContentTab {
  if (!isOwnProfile && isOwnerOnlyProfileTab(active)) return 'posts'
  return active
}
