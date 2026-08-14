'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='81 İl Sosyal Medya Ağı' subtitle='City SMM agents · hesap sağlığı · harita'>
      <AdminOsMetricGrid
        items={[
          { label: 'SMM', value: '0/81' },
          { label: 'Hesap', value: '—' },
          { label: 'Bugün paylaşım', value: '—' },
          { label: 'Başarısız', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='SMM ağı henüz seed edilmedi'
        description='Mevcut /admin/social yayın akışı çalışır. Toplu 81 SMM oluşturma Phase 5.'
        href='/admin/social'
        hrefLabel='Mevcut Sosyal Medya'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('81 İl Sosyal Medya Ağı')}</p>
    </AdminOsPageShell>
  )
}
