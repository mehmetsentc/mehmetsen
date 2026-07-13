import { permanentRedirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

/** Root `/` lands on the feed (one hop). Prefer bookmarks/canonical `/feed`. */
export default function Home() {
  permanentRedirect(ROUTES.FEED)
}
