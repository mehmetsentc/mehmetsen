'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Performans' subtitle='Latency · cost · correction rate — uydurma skor yok'>
      <AdminOsMetricGrid
        items={[
          { label: 'Calls today', value: '—' },
          { label: 'Avg latency', value: '—' },
          { label: 'Est. cost', value: '—' },
          { label: 'Human fix %', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Yeterli kullanım verisi yok'
        description='aiUsageEvents bağlandıkça metrikler burada görünecek.'

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Performans')}</p>
    </AdminOsPageShell>
  )
}
