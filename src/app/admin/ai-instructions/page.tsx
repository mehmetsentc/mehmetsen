'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Talimatlar' subtitle='Global → department → role → location → agent'>
      <AdminOsMetricGrid
        items={[
          { label: 'Global', value: '—' },
          { label: 'Role', value: '—' },
          { label: 'Location', value: '—' },
          { label: 'Versions', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Instruction set yok'
        description='Katmanlı inheritance + versioning Phase 2. Mevcut aiEditorPrompts korunur.'
        href='/admin/ai-editors'
        hrefLabel='AI Editör promptları'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Talimatlar')}</p>
    </AdminOsPageShell>
  )
}
