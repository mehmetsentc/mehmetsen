'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Sistem Sağlığı' subtitle='DB · AI · Social · Queue · Cron'>
      <AdminOsMetricGrid
        items={[
          { label: 'DB', value: '?' },
          { label: 'AI', value: '?' },
          { label: 'Social', value: '?' },
          { label: 'Cron', value: '?' }
        ]}
      />
      <AdminOsEmptyState
        title='Health probe bağlanacak'
        description="Cron sayfası ve mevcut health uçları Phase 9'da birleşir."
        href='/admin/cron'
        hrefLabel='Cron İzleme'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Sistem Sağlığı')}</p>
    </AdminOsPageShell>
  )
}
