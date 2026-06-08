'use client'

import { useEffect, useState } from 'react'
import { Cookie } from 'lucide-react'
import toast from 'react-hot-toast'
import { SettingsBackLink } from '@/components/settings/SettingsBackLink'
import { SettingsItem } from '@/components/settings/SettingsItem'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsToggle } from '@/components/settings/SettingsToggle'
import {
  getPrivacyPreferences,
  savePrivacyPreferences,
  type PrivacyPreferences,
} from '@/lib/userPreferences'
import { openConsentPreferences } from '@/lib/consent'

const privacyOptions: {
  key: keyof PrivacyPreferences
  label: string
  description: string
}[] = [
  {
    key: 'publicProfile',
    label: 'Herkese açık profil',
    description: 'Profiliniz ve gönderileriniz herkes tarafından görülebilir.',
  },
  {
    key: 'showActivity',
    label: 'Etkinlik durumunu göster',
    description: 'Beğeni ve yorum aktiviteleriniz profilinizde görünsün.',
  },
  {
    key: 'allowMentions',
    label: 'Bahsetmelere izin ver',
    description: 'Diğer kullanıcılar sizi yorumlarda @ ile etiketleyebilsin.',
  },
  {
    key: 'allowMessages',
    label: 'Mesaj isteklerine izin ver',
    description: 'Takip etmeyen kullanıcılar size mesaj gönderebilsin.',
  },
  {
    key: 'shareLocation',
    label: 'Konumu paylaş',
    description:
      'Açıkken paylaştığınız haberlere konum eklenir ve şehir kategorisi otomatik oluşturulur.',
  },
]

export default function PrivacySettingsPage() {
  const [prefs, setPrefs] = useState<PrivacyPreferences | null>(null)

  useEffect(() => {
    setPrefs(getPrivacyPreferences())
  }, [])

  const updatePref = (key: keyof PrivacyPreferences, value: boolean) => {
    setPrefs((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      savePrivacyPreferences(next)
      return next
    })
    toast.success('Kaydedildi')
  }

  return (
    <div className="space-y-6">
      <SettingsBackLink
        title="Gizlilik"
        description="Profilinizin görünürlüğünü ve etkileşim izinlerinizi yönetin."
      />

      <SettingsSection title="Gizlilik">
        {prefs &&
          privacyOptions.map((option) => (
            <SettingsToggle
              key={option.key}
              label={option.label}
              description={option.description}
              checked={prefs[option.key]}
              onChange={(checked) => updatePref(option.key, checked)}
            />
          ))}
      </SettingsSection>

      <SettingsSection title="Çerezler ve onay">
        <SettingsItem
          icon={Cookie}
          label="Çerez / gizlilik tercihleri"
          description="Analitik, pazarlama ve CCPA 'verilerimi satma' tercihlerinizi düzenleyin."
          onClick={openConsentPreferences}
        />
      </SettingsSection>

      <p className="px-1 text-xs text-[rgb(var(--color-muted))]">
        Hesap güvenliği ayarları yakında genişletilecek.
      </p>
    </div>
  )
}
