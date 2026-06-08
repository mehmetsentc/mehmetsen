'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Newspaper, Users, Flag, Clock, ArrowRight } from 'lucide-react'
import { StatsCard } from '@/components/admin/StatsCard'
import { adminService, type AdminDashboardStats } from '@/services/adminService'
import { ROUTES } from '@/constants/routes'

const quickLinks = [
  { href: ROUTES.ADMIN.NEWS, label: 'Haber Yönetimi', desc: 'Onay bekleyen ve tüm haberler' },
  { href: ROUTES.ADMIN.CATEGORIES, label: 'Kategoriler', desc: 'Kategori ekle ve düzenle' },
  { href: ROUTES.ADMIN.USERS, label: 'Kullanıcılar', desc: 'Engelle veya admin yap' },
  { href: ROUTES.ADMIN.REPORTS, label: 'Raporlar', desc: 'Kullanıcı şikayetlerini incele' },
]

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminService
      .getDashboardStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Dashboard</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          NaHaber yönetim paneline hoş geldiniz
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Toplam Haber"
          value={loading ? '…' : (stats?.totalNews ?? 0)}
          icon={Newspaper}
          accent="blue"
        />
        <StatsCard
          title="Onay Bekleyen"
          value={loading ? '…' : (stats?.pendingNews ?? 0)}
          icon={Clock}
          accent="amber"
          description="Moderasyon kuyruğu"
        />
        <StatsCard
          title="Kullanıcılar"
          value={loading ? '…' : (stats?.totalUsers ?? 0)}
          icon={Users}
          accent="green"
        />
        <StatsCard
          title="Bekleyen Rapor"
          value={loading ? '…' : (stats?.pendingReports ?? 0)}
          icon={Flag}
          accent="red"
        />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-[rgb(var(--color-text))]">Hızlı Erişim</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center justify-between rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 transition-colors hover:border-brand-500/50 hover:bg-[rgb(var(--color-surface))]"
          >
            <div>
              <p className="font-medium text-[rgb(var(--color-text))]">{link.label}</p>
              <p className="text-sm text-[rgb(var(--color-muted))]">{link.desc}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-[rgb(var(--color-muted))] transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>
    </div>
  )
}
