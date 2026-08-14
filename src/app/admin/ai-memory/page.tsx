'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Hafıza' subtitle='Agent memory + shared newsroom memory (TTL)'>
      <AdminOsMetricGrid
        items={[
          { label: 'Agent memory', value: '0' },
          { label: 'Shared', value: '0' },
          { label: 'Verified', value: '0' },
          { label: 'Expired due', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Hafıza kayıtları yok'
        description="Doğrulanmış kurumsal bellek Phase 8'de doldurulacak. Geçici haber bilgisi sonsuza kadar saklanmaz."

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Hafıza')}</p>
    </AdminOsPageShell>
  )
}
