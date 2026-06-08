'use client'

import { cn } from '@/lib/utils'

interface SettingsSectionProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <section className={cn('settings-section', className)}>
      {title && <h2 className="settings-section-title">{title}</h2>}
      <div className="settings-group">{children}</div>
    </section>
  )
}
