import { ReelsStudioPanel } from '@/components/admin/social/ReelsStudioPanel'

export default function MediaStudioReelsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">Seslendirme &amp; Reels</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Haberden Google sesli, daktilo başlıklı dikey video üret, sesleri dinle ve Instagram / Facebook&apos;ta paylaş.
        </p>
      </div>
      <ReelsStudioPanel />
    </div>
  )
}
