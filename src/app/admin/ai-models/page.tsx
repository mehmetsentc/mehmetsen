'use client'

import { AdminOsEmptyState, AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { newsroomOsReadyMessage } from '@/services/newsroomOs/adapters'

export default function Page() {
  return (
    <AdminOsPageShell title='AI Modelleri' subtitle='Provider abstraction — DeepSeek / Gemini / OpenAI / Anthropic'>
      <AdminOsMetricGrid
        items={[
          { label: 'Providers', value: '—' },
          { label: 'Primary', value: '—' },
          { label: 'Fallback', value: '—' },
          { label: 'Cost today', value: '—' }
        ]}
      />
      <AdminOsEmptyState
        title='Model registry boş görünüyor'
        description='aiModelRegistry mevcut. Bu ekran ajan bazlı primary/fallback ayarlarını yönetecek.'
        href='/admin/settings'
        hrefLabel='Ayarlar'
      />
      <p className="text-xs text-slate-500">{newsroomOsReadyMessage('AI Modelleri')}</p>
    </AdminOsPageShell>
  )
}
