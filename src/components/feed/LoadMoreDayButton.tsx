'use client'

interface LoadMoreDayButtonProps {
  onClick: () => void
  loading?: boolean
  label?: string
}

/** Shared day-pagination CTA for home + category feeds. */
export function LoadMoreDayButton({
  onClick,
  loading = false,
  label = 'Daha fazla yükle',
}: LoadMoreDayButtonProps) {
  return (
    <div className="mt-6 flex justify-center pb-8">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-full border-2 border-[rgb(var(--color-text))] px-8 py-2.5 text-sm font-semibold text-[rgb(var(--color-text))] transition-all hover:bg-[rgb(var(--color-text))] hover:text-[rgb(var(--color-bg))] disabled:opacity-50"
      >
        {loading ? 'Yükleniyor…' : label}
      </button>
    </div>
  )
}
