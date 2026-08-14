'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Audit Loglar' subtitle='HUMAN / AI / SYSTEM — kritik mutasyonlar'>
      <AdminOsMetricGrid
        items={[
          { label: 'Today', value: '0' },
          { label: 'Human', value: '0' },
          { label: 'AI', value: '0' },
          { label: 'System', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Audit kaydı yok'
        description='cmsAuditLogs. Publish, role, instruction, algorithm, social publish zorunlu loglanacak.'

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Audit Loglar')}</p>
    </AdminOsPageShell>
  )
}
