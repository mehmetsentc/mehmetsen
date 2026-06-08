import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function NewsCardSkeleton() {
  return <TimelineItemSkeleton />
}

export function TimelineItemSkeleton() {
  return (
    <div className="timeline-item">
      <div className="timeline-rail">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
      </div>
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="aspect-[16/10] w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
