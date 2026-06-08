import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { LegalDocument } from '@/components/settings/LegalDocument'
import { PRIVACY_POLICY } from '@/constants/legal'
import { ROUTES } from '@/constants/routes'

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-hub">
      <SettingsHeader
        title={PRIVACY_POLICY.title}
        backHref={ROUTES.SETTINGS_ABOUT}
        backLabel="Hakkında"
      />
      <LegalDocument document={PRIVACY_POLICY} />
    </div>
  )
}
