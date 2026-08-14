'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Organizasyonu' subtitle='Hiyerarşik ajan ağı — yönetici, masa, SMM'>
      <AdminOsMetricGrid
        items={[
          { label: 'Ajan', value: '0' },
          { label: 'Aktif', value: '0' },
          { label: 'Departman', value: '0' },
          { label: 'SMM slot', value: '81' }
        ]}
      />
      <AdminOsEmptyState
        title='Organizasyon henüz seed edilmedi'
        description='Agent modeli hazır. Phase 2 seed ile Genel Yayın Yönetmeni AI → masalar → 81 SMM ağacı oluşacak.'
        href='/admin/ai-editors'
        hrefLabel='Mevcut AI Editörler'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Organizasyonu')}</p>
    </AdminOsPageShell>
  )
}
