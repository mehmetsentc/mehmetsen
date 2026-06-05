// TODO: Implement in Phase 1
export type UserRole = 'user' | 'moderator' | 'admin'

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
  isVerified: boolean
  isBlocked: boolean
  followersCount: number
  followingCount: number
  postsCount: number
  createdAt: string
  updatedAt: string
}

export interface UserProfile extends User {
  isFollowing?: boolean
}
