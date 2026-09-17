import { FeedV2BootFallback } from '@/components/feed/smart/FeedV2RouteShell'

/**
 * Instant soft-nav paint for home → /feed-v2 while the dynamic page
 * bootstraps the first feed page (avoids a multi-second black wait).
 */
export default function FeedV2Loading() {
  return <FeedV2BootFallback />
}
