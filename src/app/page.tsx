import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

/**
 * Root `/` lands on the feed (one hop). Uses `redirect` (307) instead of
 * `permanentRedirect` (308) so browsers do NOT cache this redirect.
 * City subdomains never reach this component — middleware rewrites `/` to
 * `/city-site` before this runs. Caching a 308 here would cause city
 * subdomain visitors to loop back to /feed forever after one bad visit.
 */
export default function Home() {
  redirect(ROUTES.FEED)
}
