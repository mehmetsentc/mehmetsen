'use client'

import { FileText, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsItem } from '@/components/settings/SettingsItem'
import { APP_CONFIG } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

export default function AboutSettingsPage() {
  return (
    <>
      <SettingsHeader title="Hakkında" backHref={ROUTES.SETTINGS} backLabel="Ayarlar" />

      <SettingsSection>
        <div className="px-4 py-5 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <p className="text-2xl font-black text-[rgb(var(--color-text))]">{APP_CONFIG.NAME}</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Sürüm 0.1.0</p>
          <p className="mt-4 text-sm leading-relaxed text-[rgb(var(--color-text))]">
            {APP_CONFIG.DESCRIPTION}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Yasal">
        <SettingsItem
          icon={FileText}
          label="Kullanım koşulları"
          description="Platform kuralları, hesap sorumlulukları ve kullanıcı sözleşmesi"
          href={ROUTES.SETTINGS_TERMS}
        />
        <SettingsItem
          icon={ShieldCheck}
          label="Gizlilik politikası"
          description="Kişisel verilerinizin toplanması, kullanımı ve korunması"
          href={ROUTES.SETTINGS_PRIVACY_POLICY}
        />
      </SettingsSection>
    </>
  )
}
