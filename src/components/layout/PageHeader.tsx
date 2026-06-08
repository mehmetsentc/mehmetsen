'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  backHref = ROUTES.FEED,
  backLabel = 'Geri',
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      <header className="page-header">
        <Link href={backHref} className="page-header-back" aria-label={backLabel}>
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="page-header-title">{title}</h1>
        <span className="page-header-spacer" aria-hidden />
      </header>
      {subtitle && <p className="page-subtitle mt-2 px-1">{subtitle}</p>}
    </div>
  )
}
