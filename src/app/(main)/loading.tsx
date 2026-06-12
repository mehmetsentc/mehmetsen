import { TimelineItemSkeleton } from '@/components/ui/Skeleton'

/** Fast shell while (main) routes stream in. */
export default function MainLoading() {
  return (
    <div className="w-full space-y-4 py-2">
      {[...Array(3)].map((_, i) => (
        <TimelineItemSkeleton key={i} />
      ))}
    </div>
  )
}
