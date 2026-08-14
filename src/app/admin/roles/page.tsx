'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='Roller & Yetkiler' subtitle='RBAC + city/category scope'>
      <AdminOsMetricGrid
        items={[
          { label: 'Roller', value: '6' },
          { label: 'Permissions', value: '—' },
          { label: 'Scoped users', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Scope editörü hazırlanıyor'
        description='Mevcut CmsRole matrisi çalışıyor. Scoped grants (şehir/kategori) Phase 1 foundation + users ekranı ile genişleyecek.'
        href='/admin/users'
        hrefLabel='Kullanıcılar'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('Roller & Yetkiler')}</p>
    </AdminOsPageShell>
  )
}
