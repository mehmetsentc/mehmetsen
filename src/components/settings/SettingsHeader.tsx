'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ROUTES } from '@/constants/routes'

interface SettingsHeaderProps {
  title: string
  backHref?: string
  backLabel?: string
}

export function SettingsHeader({
  title,
  backHref = ROUTES.FEED,
  backLabel = 'Geri',
}: SettingsHeaderProps) {
  return (
    <header className="settings-header">
      <Link href={backHref} className="settings-header-back" aria-label={backLabel}>
        <ChevronLeft className="h-6 w-6" />
      </Link>
      <h1 className="settings-header-title">{title}</h1>
      <span className="settings-header-spacer" aria-hidden />
    </header>
  )
}
