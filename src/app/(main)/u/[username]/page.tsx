import type { Metadata } from 'next'
import { evaluateUserProfileSeo, robotsFromEligibility } from '@/lib/seo/seoEligibility'
import ProfilePage from '@/app/(main)/profile/[username]/page'

export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const robots = robotsFromEligibility(evaluateUserProfileSeo())
  return {
    title: `@${decodeURIComponent(username)}`,
    description: `${username} — NaHaber profili`,
    robots,
  }
}

export default ProfilePage
