'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Öğrenme Merkezi' subtitle='Diff → proposal → sandbox → human approve'>
      <AdminOsMetricGrid
        items={[
          { label: 'Proposed', value: '0' },
          { label: 'Testing', value: '0' },
          { label: 'Approved', value: '0' },
          { label: 'Deployed', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Öneri yok'
        description='Learning Engine production kurallarını kendi başına değiştirmez. Feature flag: learningEngineEnabled.'
        href='/admin/ai-editors'
        hrefLabel='AI Editörler'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Öğrenme Merkezi')}</p>
    </AdminOsPageShell>
  )
}
