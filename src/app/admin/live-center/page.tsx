'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Canlı Haber Merkezi' subtitle='Kaynak · şehir · workflow · risk — gerçek zamanlı operasyon'>
      <AdminOsMetricGrid
        items={[
          { label: 'Aktif akış', value: '—' },
          { label: 'Breaking', value: '—' },
          { label: 'Kuyruk', value: '—' },
          { label: 'Risk HIGH+', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Canlı akış bağlanıyor'
        description='Mevcut dashboard canlı olayları ve yayın kuyruğu ile beslenecek. Bu ekran Phase 3 workflow alanlarını birleştirir.'
        href='/admin'
        hrefLabel="Dashboard'a git"
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Canlı Haber Merkezi')}</p>
    </AdminOsPageShell>
  )
}
