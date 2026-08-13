'use client'

import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'

export function DesktopNewsletterSignup() {
  return (
    <section
      className="mb-10 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-6"
      aria-label="Haber bülteni"
    >
      <DesktopSectionHeader title="Haber Bülteni" className="mb-3" />
      <NewsletterSignup
        source="desktop-home"
        variant="compact"
        title=""
        description="Günün önemli haberlerini her sabah e-postanıza gönderelim."
        className="mb-0"
      />
    </section>
  )
}
