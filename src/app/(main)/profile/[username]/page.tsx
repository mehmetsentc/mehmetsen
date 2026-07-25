import type { Metadata } from 'next'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'
import { getPostsByAuthorId } from '@/services/newsService.server'
import { getPublicUserByUsername } from '@/services/userService.server'

export const revalidate = 120

function decodeUsername(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLocaleLowerCase('tr-TR')
  } catch {
    return raw.trim().toLocaleLowerCase('tr-TR')
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const username = decodeUsername((await params).username)
  const profile = await getPublicUserByUsername(username)
  if (!profile) {
    return {
      title: `@${username}`,
      description: `${username} — NaHaber profili`,
      robots: { index: false, follow: false },
    }
  }
  return {
    title: `@${profile.username}`,
    description:
      profile.bio?.trim() ||
      `${profile.displayName} (@${profile.username}) — NaHaber profili`,
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const username = decodeUsername((await params).username)
  const profile = await getPublicUserByUsername(username)
  const initialPosts = profile ? await getPostsByAuthorId(profile.uid, 24) : []

  return (
    <ProfilePageClient
      username={username}
      initialProfile={profile}
      initialPosts={initialPosts}
    />
  )
}
