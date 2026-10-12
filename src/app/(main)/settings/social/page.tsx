'use client'

/**
 * Profil → «Sosyal hesaplarım» (every signed-in user). Publishers reach the
 * same page with ?owner=publisher:ID. Only accounts this user owns / manages
 * are listed; rights are resolved on the server.
 */
import { Suspense, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SettingsBackLink } from '@/components/settings/SettingsBackLink'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { SocialAccountsManager } from '@/components/social/SocialAccountsManager'
import { ShareComposer } from '@/components/social/ShareComposer'
import { ShareHistory } from '@/components/social/ShareHistory'
import { AutomationRulesPanel } from '@/components/admin/social/AutomationRulesPanel'
import type { SocialAccountPublic } from '@/lib/social/accounts/types'

const TABS = [
  { id: 'accounts', label: 'Sosyal Hesaplarım' },
  { id: 'publish', label: 'Hesabımda Yayımla' },
  { id: 'history', label: 'Paylaşım Geçmişim' },
  // Reached from an account card («Otomasyon kuralı»); not a top-level menu item.
  { id: 'rules', label: 'Otomasyon kuralı' },
] as const
type TabId = (typeof TABS)[number]['id']

function SocialSettingsInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'accounts') as TabId
  const owner = params.get('owner')
  const publisherId = owner?.startsWith('publisher:') ? owner.slice('publisher:'.length) : null

  // ?owner=publisher:ID narrows every tab to that publisher's accounts; the
  // server still decides what is visible.
  const ownerFilter = useCallback(
    (a: Pick<SocialAccountPublic, 'ownerKind' | 'ownership'>) => (publisherId ? a.ownerKind === 'publisher' && a.ownership.publisherId === publisherId : a.ownerKind === 'user' || a.ownerKind === 'publisher'),
    [publisherId],
  )

  const setTab = (id: TabId) => {
    const q = new URLSearchParams(params.toString())
    q.set('tab', id)
    for (const k of ['social', 'fbSelect', 'account']) q.delete(k)
    router.replace(`${pathname}?${q.toString()}`)
  }

  const title = useMemo(() => (publisherId ? 'Yayıncı sosyal hesapları' : 'Sosyal hesaplarım'), [publisherId])

  if (loading) return <p className="px-4 py-8 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <SettingsBackLink title={title} />
        <p className="mt-4 text-sm">
          Sosyal hesap bağlamak için{' '}
          <Link href={`${ROUTES.LOGIN}?next=${encodeURIComponent('/settings/social')}`} className="font-semibold underline">
            giriş yapın
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <SettingsBackLink
        title={title}
        description="Instagram, Facebook ve Threads hesaplarınızı platformun kendi giriş ekranıyla bağlayın; NaHaber haberlerini hesabınızda yayımlayın ve kendi otomasyon kurallarınızı yönetin."
      />
      <nav className="flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))]" aria-label="Sosyal hesap bölümleri">
        {TABS.filter((t) => t.id !== 'rules' || tab === 'rules').map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', tab === t.id ? 'border-blue-600 text-[rgb(var(--color-text))]' : 'border-transparent text-[rgb(var(--color-muted))]')}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'accounts' && <SocialAccountsManager mode="self" ownerFilter={ownerFilter} />}
      {tab === 'publish' && <ShareComposer publisherId={publisherId ?? undefined} accountFilter={ownerFilter} />}
      {tab === 'rules' && <AutomationRulesPanel mode="self" ownerFilter={ownerFilter} />}
      {tab === 'history' && <ShareHistory accountFilter={ownerFilter} />}
      <p className="text-[11px] text-[rgb(var(--color-muted))]">
        «Otomasyonu durdur» yalnızca otomatik paylaşımı keser; elle yayımlama açık kalır. Hesabı tamamen durdurmak için «Hesabı duraklat»ı kullanın. Kurallar kapalı oluşturulur ve açmak için ayrıca onay gerekir.
      </p>
    </div>
  )
}

export default function SocialSettingsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm">Yükleniyor…</p>}>
      <SocialSettingsInner />
    </Suspense>
  )
}
