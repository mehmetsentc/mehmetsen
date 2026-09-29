import Link from 'next/link'
import { primaryButton } from './styles'

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string
  body: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-16 text-center">
      <h2 className="text-xl font-semibold tracking-tight text-[rgb(var(--color-text))]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[rgb(var(--color-muted))]">{body}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className={`${primaryButton} mt-6`}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}
