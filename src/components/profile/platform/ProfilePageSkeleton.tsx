/** Layout-shaped placeholder. No full-screen spinner. */
export function ProfilePageSkeleton() {
  return (
    <div
      className="profile-page-shell w-full py-4 motion-reduce:animate-none"
      aria-busy="true"
      aria-live="polite"
      aria-label="Profil yükleniyor"
    >
      <div className="mb-4 h-5 w-24 animate-pulse rounded-full bg-[rgb(var(--color-border))] motion-reduce:animate-none" />
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-[rgb(var(--color-border))] motion-reduce:animate-none sm:h-20 sm:w-20" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-40 max-w-full animate-pulse rounded bg-[rgb(var(--color-border))] motion-reduce:animate-none" />
          <div className="h-3 w-24 animate-pulse rounded bg-[rgb(var(--color-border))] motion-reduce:animate-none" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-[rgb(var(--color-border))] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-xl bg-[rgb(var(--color-border))] motion-reduce:animate-none sm:h-44"
          />
        ))}
      </div>
    </div>
  )
}
