import type { Metadata } from 'next'
import ProfilePage from '@/app/(main)/profile/[username]/page'

export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  return {
    title: `@${decodeURIComponent(username)}`,
    description: `${username} — NaHaber profili`,
  }
}

export default ProfilePage
