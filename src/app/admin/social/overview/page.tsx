'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { useSocialNetwork } from '@/components/admin/social/useSocialNetwork'
import { PLATFORM_LABEL, ownerLabel } from '@/components/social/socialClient'
import { TARGET_BLOCKER_TEXT } from '@/lib/social/accounts/capabilities'

export default function SocialOverviewPage() {
  const { accounts, rules, records, loading, error } = useSocialNetwork()
  const dayAgo = Date.now() - 86_400_000
  const ready = accounts.filter((a) => a.status === 'active' && !a.health.publishBlocker)
  const needsAction = accounts.filter((a) => a.status === 'needs_reauth' || a.health.tokenWarning || a.health.publishBlocker)
  const enabled = rules.filter((r) => r.enabled)
  const last24 = records.filter((r) => r.updatedAt >= dayAgo)

  return (
    <AdminOsPageShell title="Sosyal Medya — Genel Bakış" subtitle="Bağlı hesaplar, açık kurallar ve son yayınlar (gerçek veri)">
      <SocialAdminNav />
      {loading ? (
        <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…</p>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800">{error}</p>
      ) : (
        <>
          <AdminOsMetricGrid
            items={[
              { label: 'Görünen hesap', value: String(accounts.length) },
              { label: 'Yayına hazır', value: String(ready.length), tone: 'ok' },
              { label: 'İşlem gerekli', value: String(needsAction.length), tone: needsAction.length ? 'warn' : 'default' },
              { label: 'Açık kural', value: String(enabled.length) },
              { label: 'Son 24 saat yayın', value: String(last24.filter((r) => r.status === 'succeeded').length) },
              { label: 'Belirsiz sonuç', value: String(records.filter((r) => r.status === 'uncertain').length), tone: records.some((r) => r.status === 'uncertain') ? 'warn' : 'default' },
            ]}
          />
          <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
            <h2 className="mb-2 text-sm font-bold">İşlem gerektiren hesaplar</h2>
            {needsAction.length === 0 ? (
              <p className="text-sm text-[rgb(var(--color-muted))]">Yok.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {needsAction.map((a) => (
                  <li key={a.id}>
                    <b>{a.displayName}</b> · {PLATFORM_LABEL[a.platform]} · {ownerLabel(a)} —{' '}
                    {a.status === 'needs_reauth' ? 'yeniden bağlanmalı' : a.health.publishBlocker ? TARGET_BLOCKER_TEXT[a.health.publishBlocker] : 'erişim süresi yakında doluyor'}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/social/accounts" className="mt-2 inline-block text-xs underline">Hesaplara git</Link>
          </section>
          <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 text-sm">
            <h2 className="mb-2 font-bold">Platform durumu</h2>
            <ul className="list-disc space-y-1 pl-5 text-[rgb(var(--color-muted))]">
              <li>Instagram, Facebook ve Threads: görselli gönderi ve (desteklenen hesapta) hikâye yayını.</li>
              <li>Reels/video, kaydırmalı otomatik gönderi ve TikTok: henüz doğrulanmış yayın bağdaştırıcısı yok; etkin gösterilmez.</li>
              <li>Uygulamada rolü olmayan kullanıcıların bağlanabilmesi için Meta uygulama incelemesi (App Review) gerekir. Rol sahibi hesapla çalışan bağlantı, genel erişim anlamına gelmez.</li>
            </ul>
          </section>
        </>
      )}
    </AdminOsPageShell>
  )
}
