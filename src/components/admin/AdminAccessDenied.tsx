'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import {
  buildAdminEnvLine,
  isBootstrapAdminConfigured,
} from '@/lib/admin'
import { useAuth } from '@/hooks/useAuth'

interface AdminAccessDeniedProps {
  uid: string
  /** When true, show full dev setup steps instead of redirecting away. */
  showSetupGuide?: boolean
}

export function AdminAccessDenied({ uid, showSetupGuide = false }: AdminAccessDeniedProps) {
  const { refreshUser } = useAuth()
  const [copiedField, setCopiedField] = useState<'uid' | 'env' | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const envLine = buildAdminEnvLine(uid)
  const bootstrapConfigured = isBootstrapAdminConfigured()

  const copy = useCallback(async (text: string, field: 'uid' | 'env') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Clipboard may be blocked; user can still select the text manually.
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshUser()
      window.location.reload()
    } finally {
      setRefreshing(false)
    }
  }, [refreshUser])

  if (!showSetupGuide) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[rgb(var(--color-bg))] px-6 text-center">
        <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Admin yetkisi gerekli</p>
        <p className="text-sm text-[rgb(var(--color-muted))]">Ana sayfaya yönlendiriliyorsunuz…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-bg))] px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">Admin yetkisi gerekli</h1>
        <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
          Bu hesabın admin rolü yok. Yerel geliştirme için aşağıdaki adımlardan birini uygulayın,
          ardından dev sunucusunu yeniden başlatıp sayfayı yenileyin.
        </p>

        <div className="mt-6 space-y-4">
          <section>
            <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Seçenek A — .env.local (önerilen)
            </h2>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              Proje kökünde <code className="rounded bg-[rgb(var(--color-surface))] px-1">.env.local</code>{' '}
              dosyasına ekleyin, ardından <code className="rounded bg-[rgb(var(--color-surface))] px-1">npm run dev</code>{' '}
              komutunu yeniden çalıştırın.
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
              <code className="flex-1 break-all text-xs text-brand-600">{envLine}</code>
              <button
                type="button"
                onClick={() => copy(envLine, 'env')}
                className="shrink-0 rounded-md p-1.5 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-bg))] hover:text-[rgb(var(--color-text))]"
                aria-label="Env satırını kopyala"
              >
                {copiedField === 'env' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Seçenek B — Firestore
            </h2>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              Firebase Console → Firestore → <code className="rounded bg-[rgb(var(--color-surface))] px-1">users</code>{' '}
              → aşağıdaki UID → <code className="rounded bg-[rgb(var(--color-surface))] px-1">role</code>{' '}
              alanını <code className="rounded bg-[rgb(var(--color-surface))] px-1">admin</code> yapın.
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
              <code className="flex-1 break-all text-xs text-[rgb(var(--color-text))]">{uid}</code>
              <button
                type="button"
                onClick={() => copy(uid, 'uid')}
                className="shrink-0 rounded-md p-1.5 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-bg))] hover:text-[rgb(var(--color-text))]"
                aria-label="UID kopyala"
              >
                {copiedField === 'uid' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </section>

          {bootstrapConfigured && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <code className="font-medium">NEXT_PUBLIC_ADMIN_UIDS</code> tanımlı ama bu UID listede
              değil veya dev sunucusu env değişikliğinden sonra yeniden başlatılmadı.
            </p>
          )}

          <p className="text-xs text-[rgb(var(--color-muted))]">
            Firebase Admin SDK yapılandırıldıysa girişte{' '}
            <code className="rounded bg-[rgb(var(--color-surface))] px-1">/api/admin/bootstrap</code>{' '}
            otomatik olarak Firestore rolünü senkronize eder. Ayrıntılar için{' '}
            <code className="rounded bg-[rgb(var(--color-surface))] px-1">.env.example</code> dosyasına bakın.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yeniden dene
          </button>
          <Link
            href={ROUTES.FEED}
            className="inline-flex items-center rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
          >
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </div>
  )
}
