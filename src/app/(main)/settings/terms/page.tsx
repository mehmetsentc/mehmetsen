import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { LegalDocument } from '@/components/settings/LegalDocument'
import { TERMS_OF_USE } from '@/constants/legal'
import { ROUTES } from '@/constants/routes'

export default function TermsPage() {
  return (
    <div className="legal-hub">
      <SettingsHeader
        title={TERMS_OF_USE.title}
        backHref={ROUTES.SETTINGS_ABOUT}
        backLabel="Hakkında"
      />
      <LegalDocument document={TERMS_OF_USE} />
    </div>
  )
}
