'use client'

import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Check, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Report } from '@/types/common'

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  hate_speech: 'Nefret Söylemi',
  misinformation: 'Yanlış Bilgi',
  violence: 'Şiddet',
  other: 'Diğer',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  reviewed: 'İncelendi',
  dismissed: 'Reddedildi',
}

interface ReportsTableProps {
  reports: Report[]
  loading?: boolean
  onDismiss?: (id: string) => void
  onRemoveContent?: (report: Report) => void
  actionLoading?: string | null
}

export function ReportsTable({
  reports,
  loading,
  onDismiss,
  onRemoveContent,
  actionLoading,
}: ReportsTableProps) {
  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center text-[rgb(var(--color-muted))]">
        Rapor bulunamadı
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <tr>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Hedef</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Tür</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Sebep</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Durum</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Tarih</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--color-border))]">
          {reports.map((report) => (
            <tr key={report.id} className="bg-[rgb(var(--color-card))]">
              <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-[rgb(var(--color-text))]">
                {report.targetId}
              </td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">{report.targetType}</td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                {REASON_LABELS[report.reason] ?? report.reason}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    report.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {STATUS_LABELS[report.status] ?? report.status}
                </span>
              </td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true, locale: tr })}
              </td>
              <td className="px-4 py-3">
                {report.status === 'pending' && (
                  <div className="flex items-center gap-1">
                    {onDismiss && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onDismiss(report.id)}
                        disabled={actionLoading === report.id}
                        title="Yoksay"
                        className="!px-2"
                      >
                        {actionLoading === report.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {onRemoveContent && report.targetType === 'post' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onRemoveContent(report)}
                        disabled={actionLoading === report.id}
                        title="İçeriği Kaldır"
                        className="!px-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
