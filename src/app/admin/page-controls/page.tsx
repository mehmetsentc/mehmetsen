'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Sayfa Kontrolleri' subtitle='Ana sayfa / Feed / Yerel / Reels blokları'>
      <AdminOsMetricGrid
        items={[
          { label: 'Sayfa', value: '—' },
          { label: 'Blok', value: '—' },
          { label: 'Taslak', value: '0' },
          { label: 'Yayında', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Page builder kapalı'
        description='Feature flag: pageBuilderEnabled. Phase 6 sürümlemeli blok düzeni.'

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Sayfa Kontrolleri')}</p>
    </AdminOsPageShell>
  )
}
