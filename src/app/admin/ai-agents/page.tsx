'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Ajanlar' subtitle='Rol · bölge · autonomy · model'>
      <AdminOsMetricGrid
        items={[
          { label: 'Toplam', value: '0' },
          { label: 'Aktif', value: '0' },
          { label: 'Paused', value: '0' },
          { label: 'Error', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Kayıtlı ajan yok'
        description="newsroomAgents koleksiyonu boş. Mevcut aiEditors personas Phase 2'de migrate edilecek."
        href='/admin/ai-editors'
        hrefLabel='AI Editörler'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Ajanlar')}</p>
    </AdminOsPageShell>
  )
}
