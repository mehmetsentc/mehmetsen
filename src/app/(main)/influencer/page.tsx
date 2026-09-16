import type { Metadata } from 'next'
import { InfluencerClient } from '@/components/influencer/InfluencerClient'
import { getInfluencerPostsCached } from '@/lib/influencerPosts.server'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 120

export const metadata: Metadata = {
  title: 'Fenomen Haberleri | NaHaber',
  description: 'Sosyal medya ve fenomen gündemi',
  alternates: { canonical: `${getSiteUrl()}${ROUTES.INFLUENCER}` },
}

export default async function InfluencerPage() {
  const posts = await getInfluencerPostsCached()
  return <InfluencerClient initialPosts={posts} />
}
