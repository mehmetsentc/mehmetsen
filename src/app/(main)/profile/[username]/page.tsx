import type { Metadata } from 'next'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  return {
    title: `@${username}`,
    description: `${username} — NaHaber profili`,
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return <ProfilePageClient username={username} />
}
