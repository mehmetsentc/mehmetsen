import { ArticleLiftOriginCapture } from '@/components/articleLift/ArticleLiftOriginCapture'
import { MainLayoutClient } from '@/components/layout/MainLayoutClient'

/**
 * National chrome only. City hosts are rewritten to /city-site/* in
 * middleware, so this layout must not read the request header or cookie
 * store — that opt-out made every /haber and /etiket response private and
 * uncached (Cache-Control: private, no-cache, no-store).
 */
export default function MainLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  // LP7R.2 Article Lift: Next.js parallel-route slot for `@modal`
  // (src/app/(main)/@modal). Typed as required, not optional — Next's own
  // generated route types (.next/types/app/(main)/layout.ts) require every
  // parallel-route slot key to be present, since Next.js always provides a
  // value for it (falling back to @modal/default.tsx's `null` on every
  // route that isn't the intercepted article route). It is still a no-op
  // on every existing route, including feed-v2/Smart Feed — this change is
  // purely additive.
  modal: React.ReactNode
}) {
  return (
    <>
      <ArticleLiftOriginCapture />
      <MainLayoutClient>{children}</MainLayoutClient>
      {modal}
    </>
  )
}
