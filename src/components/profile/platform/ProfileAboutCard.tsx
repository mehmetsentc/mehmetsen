import type { ReactNode } from 'react'

export function ProfileAboutCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--color-muted))]">
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-[rgb(var(--color-text))]">{children}</div>
    </section>
  )
}
