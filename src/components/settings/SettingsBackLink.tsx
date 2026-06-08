'use client'

import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { ROUTES } from '@/constants/routes'

interface SettingsBackLinkProps {
  title: string
  description?: string
  backHref?: string
}

export function SettingsBackLink({
  title,
  description,
  backHref = ROUTES.SETTINGS,
}: SettingsBackLinkProps) {
  return (
    <div className="mb-4 space-y-2">
      <SettingsHeader title={title} backHref={backHref} backLabel="Ayarlar" />
      {description && (
        <p className="px-1 text-sm text-[rgb(var(--color-muted))]">{description}</p>
      )}
    </div>
  )
}
