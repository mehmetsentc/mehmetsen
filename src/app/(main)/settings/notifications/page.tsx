'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { SettingsBackLink } from '@/components/settings/SettingsBackLink'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsToggle } from '@/components/settings/SettingsToggle'
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/userPreferences'

const pushOptions: {
  key: keyof Pick<NotificationPreferences, 'likes' | 'comments' | 'follows' | 'mentions'>
  label: string
  description: string
}[] = [
  {
    key: 'likes',
    label: 'Beğeniler',
    description: 'Gönderileriniz beğenildiğinde bildirim alın.',
  },
  {
    key: 'comments',
    label: 'Yorumlar',
    description: 'Gönderilerinize yorum yapıldığında bildirim alın.',
  },
  {
    key: 'follows',
    label: 'Takip',
    description: 'Birisi sizi takip ettiğinde bildirim alın.',
  },
  {
    key: 'mentions',
    label: 'Bahsetmeler',
    description: 'Yorumlarda sizden bahsedildiğinde bildirim alın.',
  },
]

const emailOptions: {
  key: keyof Pick<NotificationPreferences, 'newsUpdates' | 'emailNotifications'>
  label: string
  description: string
}[] = [
  {
    key: 'newsUpdates',
    label: 'Haber özeti',
    description: 'Gündem ve takip ettiğiniz konulardan haftalık özet.',
  },
  {
    key: 'emailNotifications',
    label: 'E-posta bildirimleri',
    description: 'Önemli etkileşimler için e-posta gönderilsin.',
  },
]

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)

  useEffect(() => {
    setPrefs(getNotificationPreferences())
  }, [])

  const updatePref = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setPrefs((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      saveNotificationPreferences(next)
      return next
    })
    toast.success('Kaydedildi')
  }

  return (
    <div className="space-y-6">
      <SettingsBackLink
        title="Bildirimler"
        description="Hangi etkileşimlerde bildirim almak istediğinizi seçin."
      />

      <SettingsSection title="Uygulama içi">
        {prefs &&
          pushOptions.map((option) => (
            <SettingsToggle
              key={option.key}
              label={option.label}
              description={option.description}
              checked={prefs[option.key]}
              onChange={(checked) => updatePref(option.key, checked)}
            />
          ))}
      </SettingsSection>

      <SettingsSection title="E-posta">
        {prefs &&
          emailOptions.map((option) => (
            <SettingsToggle
              key={option.key}
              label={option.label}
              description={option.description}
              checked={prefs[option.key]}
              onChange={(checked) => updatePref(option.key, checked)}
            />
          ))}
      </SettingsSection>
    </div>
  )
}
