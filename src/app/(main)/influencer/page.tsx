import type { Metadata } from 'next'
import { InfluencerClient } from '@/components/influencer/InfluencerClient'
import { getInfluencerPostsCached } from '@/lib/influencerPosts.server'
import { getSiteUrl } from '@/lib/seo'

export const revalidate = 120

export const metadata: Metadata = {
  title: 'Influencer Haberleri | NaHaber',
  description: 'Sosyal medya ve influencer gündemi',
  alternates: { canonical: `${getSiteUrl()}/influencer` },
}

export default async function InfluencerPage() {
  const posts = await getInfluencerPostsCached()
  return <InfluencerClient initialPosts={posts} />
}
