export type UserRole =
  | 'user'
  | 'moderator'
  | 'admin'
  | 'super_admin'
  | 'managing_editor'
  | 'editor'
  | 'author'
  | 'video_editor'

export interface User {
  uid: string
  username: string
  displayName: string
  email: string
  photoURL: string | null
  bio: string | null
  website: string | null
  location: string | null
  role: UserRole
  /** CMS department (editorial, video, tech) */
  department?: string
  isVerified: boolean
  isBlocked: boolean
  followersCount: number
  followingCount: number
  postsCount: number
  onboardingCompleted: boolean
  /** User's home city slug for feed personalization */
  citySlug?: string | null
  /** Interest tags from onboarding (lowercase) */
  interests?: string[]
  /** Preferred news category ids */
  favoriteCategories?: string[]
  /** Favorite sports team name */
  favoriteTeam?: string | null
  /** Favorite sport branch id (futbol, basketbol, voleybol…) */
  favoriteSport?: string | null
  /** ISO timestamp of when user accepted Terms of Service / EULA. Null = not yet accepted. */
  termsAcceptedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface UserProfile extends User {
  isFollowing?: boolean
}
