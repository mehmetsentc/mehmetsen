import { TimelineItemSkeleton } from '@/components/ui/Skeleton'

/**
 * Fast shell while (main) routes stream in. Re-exported per segment, never as
 * app/loading.tsx or (main)/loading.tsx: a Suspense boundary above /haber,
 * /etiket, /yazar or /kategori turns their notFound() into HTTP 200.
 */
export default function MainRouteLoading() {
  return (
    <div className="w-full space-y-4 py-2">
      {[...Array(3)].map((_, i) => (
        <TimelineItemSkeleton key={i} />
      ))}
    </div>
  )
}
