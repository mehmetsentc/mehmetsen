'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState(
    process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  )
  const [notifications, setNotifications] = useState(
    process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true'
  )
  const [analytics, setAnalytics] = useState(
    process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'
  )

  const handleSave = () => {
    toast.success('Ayarlar kaydedildi (yerel önizleme — kalıcı kayıt için env güncelleyin)')
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Ayarlar</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Site yapılandırması ve özellik bayrakları
        </p>
      </div>

      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <h2 className="mb-4 font-semibold text-[rgb(var(--color-text))]">Genel</h2>
          <div>
            <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">Site Adı</label>
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <h2 className="mb-4 font-semibold text-[rgb(var(--color-text))]">Özellik Bayrakları</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="h-4 w-4 rounded border-[rgb(var(--color-border))]"
              />
              <span className="text-sm text-[rgb(var(--color-text))]">Bildirimler (NEXT_PUBLIC_ENABLE_NOTIFICATIONS)</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="h-4 w-4 rounded border-[rgb(var(--color-border))]"
              />
              <span className="text-sm text-[rgb(var(--color-text))]">Analitik (NEXT_PUBLIC_ENABLE_ANALYTICS)</span>
            </label>
          </div>
          <p className="mt-3 text-xs text-[rgb(var(--color-muted))]">
            Kalıcı değişiklikler için <code>.env</code> dosyasını güncelleyin.
          </p>
        </div>

        <Button onClick={handleSave}>Kaydet</Button>
      </div>
    </div>
  )
}
