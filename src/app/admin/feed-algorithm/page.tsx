'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Feed & Algoritma' subtitle='Ağırlıklar + Algorithm Agent önerileri (otomatik deploy yok)'>
      <AdminOsMetricGrid
        items={[
          { label: 'Weights', value: '—' },
          { label: 'Proposals', value: '0' },
          { label: 'Simulations', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Öneri yok'
        description='algorithmAgentEnabled flag kapalı olabilir. Simülasyon + human approve zorunlu.'

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Feed & Algoritma')}</p>
    </AdminOsPageShell>
  )
}
