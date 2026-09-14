import { cn } from '@/lib/utils'

interface NewspaperEditorialPageProps {
  title: string
  kicker?: string
  updated?: string
  children: React.ReactNode
  className?: string
  width?: 'article' | 'wide'
}

/** Shared desktop/mobile editorial frame — same kicker, serif title, rule as the newspaper. */
export function NewspaperEditorialPage({
  title,
  kicker = 'NaHaber',
  updated,
  children,
  className,
  width = 'article',
}: NewspaperEditorialPageProps) {
  return (
    <article
      className={cn(
        'nl-editorial desktop-newspaper-shell w-full pb-12 pt-2',
        width === 'article' ? 'mx-auto max-w-3xl' : 'max-w-none',
        className
      )}
    >
      <header className="mb-8">
        <p className="nl-kicker">{kicker}</p>
        <h1 className="nl-editorial__title">{title}</h1>
        {updated ? (
          <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">{updated}</p>
        ) : null}
        <hr className="nl-rule-thick mt-6" />
      </header>
      <div className="nl-editorial__body">{children}</div>
    </article>
  )
}
