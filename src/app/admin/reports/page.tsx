'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ReportsTable } from '@/components/admin/ReportsTable'
import { adminService } from '@/services/adminService'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { Report, ReportStatus } from '@/types/common'

type FilterStatus = ReportStatus | 'all'

const FILTERS: { id: FilterStatus; label: string }[] = [
  { id: 'pending', label: 'Bekleyen' },
  { id: 'reviewed', label: 'İncelenen' },
  { id: 'dismissed', label: 'Yoksayılan' },
  { id: 'all', label: 'Tümü' },
]

export default function AdminReportsPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminService.listReports(filter)
      setReports(result.reports)
    } catch (err) {
      console.error(err)
      toast.error('Raporlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const handleDismiss = async (id: string) => {
    if (!user) return
    setActionLoading(id)
    try {
      await adminService.dismissReport(id, user.uid)
      toast.success('Rapor yoksayıldı')
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'dismissed' as const } : r))
      )
    } catch {
      toast.error('İşlem başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveContent = async (report: Report) => {
    if (!user) return
    if (!confirm('Raporlanan içeriği kaldırmak istediğinize emin misiniz?')) return
    setActionLoading(report.id)
    try {
      await adminService.removeReportedContent(report.targetId, report.id, user.uid)
      toast.success('İçerik kaldırıldı')
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: 'reviewed' as const } : r))
      )
    } catch {
      toast.error('İşlem başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Raporlar</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Kullanıcı şikayetlerini inceleyin ve işlem yapın
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === f.id
                ? 'bg-brand-600 text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ReportsTable
        reports={reports}
        loading={loading}
        onDismiss={handleDismiss}
        onRemoveContent={handleRemoveContent}
        actionLoading={actionLoading}
      />
    </div>
  )
}
