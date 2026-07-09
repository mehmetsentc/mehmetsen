import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DesktopSectionHeaderProps {
  title: string
  href?: string
  className?: string
  variant?: 'default' | 'brand'
}

export function DesktopSectionHeader({ title, href, className, variant = 'default' }: DesktopSectionHeaderProps) {
  const content = (
    <>
      <span>{title}</span>
      {href ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
    </>
  )

  const cls = cn(
    'mb-5 flex items-center gap-1 pt-3 text-sm font-black uppercase tracking-wide',
    variant === 'brand'
      ? 'border-t-2 border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]'
      : 'border-t border-[rgb(var(--color-text))] text-[rgb(var(--color-text))]',
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
