'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { auth } from '@/lib/firebase/auth'

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
  const [migrating, setMigrating] = useState(false)
  const [migrateLog, setMigrateLog] = useState<string | null>(null)

  const handleSave = () => {
    toast.success('Ayarlar kaydedildi (yerel önizleme — kalıcı kayıt için env güncelleyin)')
  }

  const runTimestampMigration = async () => {
    if (!confirm('Timestamp → ms migrasyonu başlatılsın mı? Tüm eski haberler güncellenir.')) return
    setMigrating(true)
    setMigrateLog('Başlatılıyor…')
    let cursor: string | undefined
    let totalMigrated = 0
    let batch = 0

    try {
      const token = await auth.currentUser?.getIdToken()
      while (true) {
        batch++
        const res = await fetch('/api/admin/migrate/fix-timestamps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
          body: JSON.stringify({ cursor }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { migrated: number; scanned: number; done: boolean; cursor?: string }
        totalMigrated += data.migrated
        setMigrateLog(`Batch ${batch}: ${data.scanned} tarandı, ${data.migrated} güncellendi — toplam: ${totalMigrated}`)
        if (data.done) break
        cursor = data.cursor
      }
      setMigrateLog(`✅ Tamamlandı — ${totalMigrated} haber güncellendi`)
      toast.success(`Migrasyon tamamlandı: ${totalMigrated} haber`)
    } catch (e) {
      setMigrateLog(`❌ Hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`)
      toast.error('Migrasyon başarısız')
    } finally {
      setMigrating(false)
    }
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

        {/* Veri Bakım */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
          <h2 className="mb-1 font-semibold text-amber-800 dark:text-amber-300">Veri Bakım Araçları</h2>
          <p className="mb-4 text-xs text-amber-700 dark:text-amber-400">
            Eski AI pipeline&apos;ından gelen haberlerde <code>publishedAt</code> alanı
            Firestore Timestamp tipinde — bu yüzden feed sıralaması bozuluyor.
            Bu araç tüm eski Timestamp değerlerini milisaniye sayısına çevirir.
          </p>
          <button
            onClick={() => void runTimestampMigration()}
            disabled={migrating}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {migrating ? '⏳ Çalışıyor…' : '🔧 Timestamp Migrasyonunu Çalıştır'}
          </button>
          {migrateLog && (
            <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-mono text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {migrateLog}
            </p>
          )}
        </div>

        <Button onClick={handleSave}>Kaydet</Button>
      </div>
    </div>
  )
}
