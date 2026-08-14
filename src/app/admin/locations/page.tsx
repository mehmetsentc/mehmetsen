'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='81 İl & Lokasyon' subtitle='Türkiye → İl → İlçe → Belde'>
      <AdminOsMetricGrid
        items={[
          { label: 'İl', value: '81' },
          { label: 'Aktif site', value: '—' },
          { label: 'SMM bağlı', value: '—' },
          { label: 'Pasif', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Lokasyon yönetimi açıldı'
        description='81 il constants + Drizzle provinces zaten var. Bu panel şehir ops (SMM, SEO, feed) ayarlarını ekler.'
        href='/admin/smm'
        hrefLabel='81 İl SMM'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('81 İl & Lokasyon')}</p>
    </AdminOsPageShell>
  )
}
