'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='SMM Paylaşım Kuyruğu' subtitle='Idempotent publish · retry · dead-letter'>
      <AdminOsMetricGrid
        items={[
          { label: 'Queued', value: '0' },
          { label: 'Retrying', value: '0' },
          { label: 'Failed', value: '0' },
          { label: 'Sent today', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Kuyruk boş'
        description='smmQueue koleksiyonu hazır. Mevcut social cron ile birleştirilecek.'
        href='/admin/social'
        hrefLabel='Sosyal Medya'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('SMM Paylaşım Kuyruğu')}</p>
    </AdminOsPageShell>
  )
}
