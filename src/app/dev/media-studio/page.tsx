import { notFound } from 'next/navigation'
import { DevStudioFrame } from '@/components/media-studio/DevStudioFrame'
import { isMediaStudioEnabled } from '@/media-studio/featureFlag'

export const dynamic = 'force-dynamic'

/** Local visual harness. Hidden outside development and while the flag is off. */
export default async function MediaStudioDevPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  if (!isMediaStudioEnabled()) notFound()
  const query = await searchParams
  return <DevStudioFrame screen={query.screen ?? 'import'} />
}
