import type { User } from '@/types/user'

export function ProfileAboutPanel({ user }: { user: User }) {
  const rows = [
    { label: 'Ad Soyad', value: user.displayName },
    { label: 'Kullanıcı adı', value: user.username ? `@${user.username}` : null },
    { label: 'Konum', value: user.location },
    { label: 'Hakkında', value: user.bio },
    { label: 'Web sitesi', value: user.website },
  ].filter((row) => Boolean(row.value))

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[rgb(var(--nah-text-muted))]">
        Bu profil henüz hakkında bilgisi eklememiş.
      </p>
    )
  }

  return (
    <dl className="space-y-3 px-4 py-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-2xl bg-white/5 px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--nah-text-muted))]">
            {row.label}
          </dt>
          <dd className="mt-1 text-sm text-white">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
