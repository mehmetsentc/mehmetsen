'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Görevler' subtitle='Ajanlar arası task bus'>
      <AdminOsMetricGrid
        items={[
          { label: 'Pending', value: '0' },
          { label: 'Processing', value: '0' },
          { label: 'Needs human', value: '0' },
          { label: 'Failed', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Açık görev yok'
        description="agentTasks koleksiyonu hazır. Pipeline aşamaları Phase 3'te task olarak yazılacak."
        href='/admin/newsroom'
        hrefLabel='AI Newsroom'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Görevler')}</p>
    </AdminOsPageShell>
  )
}
