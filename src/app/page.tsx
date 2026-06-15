import { permanentRedirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

export default function Home() {
  permanentRedirect(ROUTES.FEED)
}
