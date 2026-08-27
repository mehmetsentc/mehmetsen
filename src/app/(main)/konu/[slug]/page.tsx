import { permanentRedirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { parseTagSlug, isValidTagSlug } from '@/lib/tags'

interface Props {
  params: Promise<{ slug: string }>
}

/** /konu/[slug] → canonical /etiket/[slug] alias (P6 topic pages). */
export default async function TopicAliasPage({ params }: Props) {
  const tag = parseTagSlug((await params).slug)
  if (!isValidTagSlug(tag)) {
    permanentRedirect(ROUTES.FEED)
  }
  permanentRedirect(ROUTES.TAG(tag))
}
