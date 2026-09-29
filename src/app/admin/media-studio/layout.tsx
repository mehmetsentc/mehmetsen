import { notFound } from 'next/navigation'
import { isMediaStudioEnabled } from '@/media-studio/featureFlag'
import { MediaStudioShell } from '@/components/media-studio/MediaStudioShell'
import { StudioLiveBridge } from '@/components/media-studio/studioActions'

export const dynamic = 'force-dynamic'

export default function MediaStudioLayout({ children }: { children: React.ReactNode }) {
  if (!isMediaStudioEnabled()) notFound()
  return (
    <StudioLiveBridge>
      <MediaStudioShell>{children}</MediaStudioShell>
    </StudioLiveBridge>
  )
}
