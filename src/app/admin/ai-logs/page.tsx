'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Logları' subtitle='Execution traces (secrets hariç)'>
      <AdminOsMetricGrid
        items={[
          { label: 'Today', value: '0' },
          { label: 'Errors', value: '0' },
          { label: 'Retries', value: '0' },
          { label: 'Needs human', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Log yok'
        description='agentExecutions + aiLogs birleşik izleme Phase 9.'
        href='/admin/cron'
        hrefLabel='Cron İzleme'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Logları')}</p>
    </AdminOsPageShell>
  )
}
