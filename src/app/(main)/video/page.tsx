import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

/** Header “Video” alias — same immersive player as /reels. */
export default function VideoAliasPage() {
  redirect(ROUTES.REELS)
}
