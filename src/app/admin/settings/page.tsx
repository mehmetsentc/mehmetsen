'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Layers,
  LayoutGrid,
  SlidersHorizontal,
  Search,
  Megaphone,
  Mail,
  Share2,
  Tag,
  Activity,
  Wrench,
} from 'lucide-react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import {
  CMS_FLAG_LABELS,
  defaultSiteSettings,
  type SiteSettings,
} from '@/lib/siteSettings'
import type { CmsFeatureFlagKey } from '@/types/newsroomOs'

const HUB_LINKS = [
  {
    href: ROUTES.ADMIN.GLOBAL_LAYOUT,
    label: 'Global Dizilim',
    hint: 'Navbar, kategoriler, ana sayfa blokları, footer',
    icon: Layers,
  },
  {
    href: ROUTES.ADMIN.PAGE_CONTROLS,
    label: 'Sayfa Kontrolleri',
    hint: 'Feed / Yerel / Reels blok sürümleri',
    icon: LayoutGrid,
  },
  {
    href: ROUTES.ADMIN.CATEGORIES,
    label: 'Kategoriler',
    hint: 'Haber kategorileri ve alt başlıklar',
    icon: Tag,
  },
  {
    href: ROUTES.ADMIN.FEED_ALGORITHM,
    label: 'Feed & Algoritma',
    hint: 'Sıralama ağırlıkları (onaylı öneri)',
    icon: SlidersHorizontal,
  },
  {
    href: ROUTES.ADMIN.SEO,
    label: 'SEO',
    hint: 'Başlık, açıklama ve slug denetimi',
    icon: Search,
  },
  {
    href: ROUTES.ADMIN.ADS,
    label: 'Reklamlar',
    hint: 'Banner slotları ve kampanyalar',
    icon: Megaphone,
  },
  {
    href: ROUTES.ADMIN.NEWSLETTER,
    label: 'Bülten',
    hint: 'Aboneler ve gönderim',
    icon: Mail,
  },
  {
    href: ROUTES.ADMIN.SOCIAL,
    label: 'Sosyal hesaplar',
    hint: 'Paylaşım hesapları ve otomasyon',
    icon: Share2,
  },
] as const

async function authHeaders(): Promise<HeadersInit> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function FlagRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[rgb(var(--color-border))] px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-[rgb(var(--color-muted))]">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[rgb(var(--color-border))]"
      />
    </label>
  )
}

export default function AdminSettingsPage() {
  const { can } = useCmsAuth()
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateLog, setMigrateLog] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillLog, setBackfillLog] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/site-settings', { headers: await authHeaders() })
      if (!res.ok) throw new Error('load')
      const body = (await res.json()) as { settings: SiteSettings }
      setSettings(body.settings)
    } catch {
      toast.error('Ayarlar yüklenemedi — varsayılanlar gösteriliyor')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('save')
      const body = (await res.json()) as { settings: SiteSettings }
      setSettings(body.settings)
      toast.success('Global ayarlar kaydedildi')
    } catch {
      toast.error('Kayıt başarısız')
    } finally {
      setSaving(false)
    }
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
        const data = (await res.json()) as { migrated: number; scanned: number; done: boolean; cursor?: string }
        totalMigrated += data.migrated
        setMigrateLog(`Batch ${batch}: ${data.scanned} tarandı, ${data.migrated} güncellendi — toplam: ${totalMigrated}`)
        if (data.done) break
        cursor = data.cursor
      }
      setMigrateLog(`Tamamlandı — ${totalMigrated} haber güncellendi`)
      toast.success(`Migrasyon tamamlandı: ${totalMigrated} haber`)
    } catch (e) {
      setMigrateLog(`Hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`)
      toast.error('Migrasyon başarısız')
    } finally {
      setMigrating(false)
    }
  }

  const runPublishedAtBackfill = async () => {
    if (!confirm('publishedAt backfill başlatılsın mı? Yayında olup tarihi eksik haberler düzeltilir.')) return
    setBackfilling(true)
    setBackfillLog('Başlatılıyor…')
    let cursor: string | undefined
    let totalFixed = 0
    let batch = 0
    try {
      const token = await auth.currentUser?.getIdToken()
      while (true) {
        batch++
        const res = await fetch('/api/admin/migrate/backfill-published-at', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
          body: JSON.stringify({ cursor }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { fixed: number; scanned: number; done: boolean; cursor?: string }
        totalFixed += data.fixed
        setBackfillLog(`Batch ${batch}: ${data.scanned} tarandı, ${data.fixed} düzeltildi — toplam: ${totalFixed}`)
        if (data.done) break
        cursor = data.cursor
      }
      setBackfillLog(`Tamamlandı — ${totalFixed} haber düzeltildi`)
      toast.success(`Backfill tamamlandı: ${totalFixed} haber`)
    } catch (e) {
      setBackfillLog(`Hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`)
      toast.error('Backfill başarısız')
    } finally {
      setBackfilling(false)
    }
  }

  if (!can('system:settings')) {
    return (
      <AdminOsPageShell title="Global Ayarlar" subtitle="Bu sayfa için yetkiniz yok">
        <p className="text-sm text-[rgb(var(--color-muted))]">system:settings izni gerekir.</p>
      </AdminOsPageShell>
    )
  }

  const flagOnCount = Object.values(settings.cmsFlags).filter(Boolean).length

  return (
    <AdminOsPageShell
      title="Global Ayarlar"
      subtitle="Site kimliği, dizilim, yayın ve özellikler — kaydet kalıcıdır"
      actions={
        <Button onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Site', value: settings.siteName || '—' },
          { label: 'Bildirim', value: settings.notificationsEnabled ? 'Açık' : 'Kapalı', tone: settings.notificationsEnabled ? 'ok' : 'default' },
          { label: 'Analitik', value: settings.analyticsEnabled ? 'Açık' : 'Kapalı', tone: settings.analyticsEnabled ? 'ok' : 'default' },
          { label: 'CMS bayrak', value: `${flagOnCount}/${Object.keys(settings.cmsFlags).length}` },
          {
            label: 'Son kayıt',
            value: settings.updatedAt
              ? new Date(settings.updatedAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : '—',
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">Site kimliği</h2>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Başlık, slogan ve iletişim — public sitede metadata ve şema için kullanılır.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Site adı</label>
              <Input
                value={settings.siteName}
                onChange={(e) => setSettings((s) => ({ ...s, siteName: e.target.value }))}
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Slogan</label>
              <Input
                value={settings.tagline}
                onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">Kısa açıklama</label>
              <textarea
                value={settings.description}
                onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
                disabled={loading}
                rows={3}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">İletişim e-posta</label>
              <Input
                type="email"
                value={settings.contactEmail}
                onChange={(e) => setSettings((s) => ({ ...s, contactEmail: e.target.value }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['x', 'X / Twitter'],
                ['facebook', 'Facebook'],
                ['instagram', 'Instagram'],
                ['youtube', 'YouTube'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-[rgb(var(--color-muted))]">{label}</label>
                  <Input
                    value={settings.social[key]}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, social: { ...s.social, [key]: e.target.value } }))
                    }
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">Global dizilim ve yayın</h2>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Header kategorileri, sayfa blokları ve keşif araçları ayrı sayfalarda yönetilir.
          </p>
          <div className="mt-4 grid gap-2">
            {HUB_LINKS.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] px-3 py-2.5 transition-colors hover:bg-[rgb(var(--color-surface))]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">{item.label}</span>
                    <span className="block truncate text-xs text-[rgb(var(--color-muted))]">{item.hint}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
        <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">Özellikler</h2>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Public bayraklar sitede uygulanır. CMS bayrakları newsroom OS içindir.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FlagRow
            label="Bildirimler"
            hint="OneSignal push (uygulama kimliği env’de olmalı)"
            checked={settings.notificationsEnabled}
            onChange={(notificationsEnabled) => setSettings((s) => ({ ...s, notificationsEnabled }))}
          />
          <FlagRow
            label="Analitik"
            hint="Sayfa görüntüleme ve Web Vitals"
            checked={settings.analyticsEnabled}
            onChange={(analyticsEnabled) => setSettings((s) => ({ ...s, analyticsEnabled }))}
          />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {(Object.keys(CMS_FLAG_LABELS) as CmsFeatureFlagKey[]).map((key) => (
            <FlagRow
              key={key}
              label={CMS_FLAG_LABELS[key]}
              checked={settings.cmsFlags[key]}
              onChange={(next) =>
                setSettings((s) => ({ ...s, cmsFlags: { ...s.cmsFlags, [key]: next } }))
              }
            />
          ))}
        </div>
      </section>

      <details className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <Wrench className="h-4 w-4" />
          Veri bakım araçları
        </summary>
        <p className="mt-3 text-xs text-amber-800/80 dark:text-amber-400">
          Eski kayıtlarda Timestamp / eksik publishedAt sorunlarını düzeltmek için. Günlük iş değil.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runTimestampMigration()}
            disabled={migrating}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {migrating ? 'Çalışıyor…' : 'Timestamp migrasyonu'}
          </button>
          <button
            type="button"
            onClick={() => void runPublishedAtBackfill()}
            disabled={backfilling}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {backfilling ? 'Çalışıyor…' : 'publishedAt backfill'}
          </button>
          <Link
            href={ROUTES.ADMIN.SYSTEM_HEALTH}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
          >
            <Activity className="h-4 w-4" />
            Sistem durumu
          </Link>
        </div>
        {migrateLog ? (
          <p className={cn('mt-3 rounded-lg bg-amber-100 px-3 py-2 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200')}>
            {migrateLog}
          </p>
        ) : null}
        {backfillLog ? (
          <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 font-mono text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            {backfillLog}
          </p>
        ) : null}
      </details>
    </AdminOsPageShell>
  )
}
