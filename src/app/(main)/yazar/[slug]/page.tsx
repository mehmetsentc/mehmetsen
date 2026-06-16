import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

type PageProps = { params: Promise<{ slug: string }> }

/** External RSS source pages are disabled — keep traffic on NaHaber. */
export default async function YazarPage(_props: PageProps) {
  redirect(ROUTES.FEED)
}
