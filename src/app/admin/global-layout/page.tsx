'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Global Dizilim' subtitle='Navbar · footer · mobil nav — taslak / önizle / yayınla'>
      <AdminOsMetricGrid
        items={[
          { label: 'Draft', value: '0' },
          { label: 'Published', value: '0' },
          { label: 'Rollback pts', value: '0' }
        ]}
      />
      <AdminOsEmptyState
        title='Layout versiyonu yok'
        description='pageLayouts + pageLayoutVersions. Rollback destekli yayın Phase 6.'

      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Global Dizilim')}</p>
    </AdminOsPageShell>
  )
}
