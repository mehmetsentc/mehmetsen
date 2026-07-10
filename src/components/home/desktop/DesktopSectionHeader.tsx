import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DesktopSectionHeaderProps {
  title: string
  href?: string
  className?: string
  variant?: 'default' | 'brand' | 'bbc'
}

export function DesktopSectionHeader({ title, href, className, variant = 'bbc' }: DesktopSectionHeaderProps) {
  const content = (
    <>
      <span>{title}</span>
      {href ? <ChevronRight className="h-5 w-5 shrink-0" aria-hidden /> : null}
    </>
  )

  const cls = cn(
    'mb-5 flex items-center gap-1',
    variant === 'brand' &&
      'border-t-2 border-[rgb(var(--color-brand))] pt-3 text-sm font-black uppercase tracking-wide text-[rgb(var(--color-brand))]',
    variant === 'default' &&
      'border-t border-[rgb(var(--color-text))] pt-3 text-sm font-black uppercase tracking-wide text-[rgb(var(--color-text))]',
    variant === 'bbc' &&
      'border-t-4 border-[rgb(var(--color-text))] pt-4 text-2xl font-bold normal-case tracking-tight text-[rgb(var(--color-text))]',
    className
  )

  if (href) {
    return (
      <Link href={href} className={cn(cls, 'group w-fit hover:opacity-80')}>
        {content}
      </Link>
    )
  }

  return <h2 className={cls}>{content}</h2>
}
