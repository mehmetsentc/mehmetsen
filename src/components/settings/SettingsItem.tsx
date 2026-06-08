'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SettingsItemProps {
  icon?: LucideIcon
  label: string
  description?: string
  value?: string
  href?: string
  onClick?: () => void
  destructive?: boolean
  className?: string
}

export function SettingsItem({
  icon: Icon,
  label,
  description,
  value,
  href,
  onClick,
  destructive = false,
  className,
}: SettingsItemProps) {
  const content = (
    <>
      {Icon && (
        <span className="settings-item-icon">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="settings-item-body">
        <span
          className={cn(
            'settings-item-label',
            destructive && 'text-red-600 dark:text-red-400'
          )}
        >
          {label}
        </span>
        {description && <span className="settings-item-description">{description}</span>}
      </span>
      {value && <span className="settings-item-value">{value}</span>}
      {(href || onClick) && !destructive && (
        <ChevronRight className="settings-item-chevron" />
      )}
    </>
  )

  const rowClass = cn('settings-item', className)

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass}>
        {content}
      </button>
    )
  }

  return <div className={rowClass}>{content}</div>
}
