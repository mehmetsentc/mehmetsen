'use client'

import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsItem } from '@/components/settings/SettingsItem'
import { ROUTES } from '@/constants/routes'
import { Mail, MessageCircle, Shield } from 'lucide-react'

const helpTopics = [
  {
    icon: MessageCircle,
    label: 'Haber nasıl paylaşılır?',
    description: 'Ana sayfadaki + Haber Oluştur ile metin, fotoğraf veya video paylaşabilirsiniz.',
  },
  {
    icon: Shield,
    label: 'Gizlilik ayarları',
    description: 'Konum paylaşımı ve profil görünürlüğünü Gizlilik bölümünden yönetin.',
    href: ROUTES.SETTINGS_PRIVACY,
  },
  {
    icon: Mail,
    label: 'Destek',
    description: 'Sorun bildirmek için destek@nahaber.app adresine yazabilirsiniz.',
  },
]

export default function HelpSettingsPage() {
  return (
    <>
      <SettingsHeader title="Yardım" backHref={ROUTES.SETTINGS} backLabel="Ayarlar" />

      <SettingsSection>
        {helpTopics.map((topic) =>
          topic.href ? (
            <SettingsItem
              key={topic.label}
              icon={topic.icon}
              label={topic.label}
              description={topic.description}
              href={topic.href}
            />
          ) : (
            <div key={topic.label} className="px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="settings-item-icon">
                  <topic.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="settings-item-label">{topic.label}</p>
                  <p className="settings-item-description">{topic.description}</p>
                </div>
              </div>
            </div>
          )
        )}
      </SettingsSection>
    </>
  )
}
