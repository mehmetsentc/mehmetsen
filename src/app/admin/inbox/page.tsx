'use client'

import Link from 'next/link'
import { Mail, Shield, ExternalLink, ArrowRight } from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'

/**
 * Haber Merkezi Gelen Kutusu — info@nahaber.com
 *
 * Gmail OAuth entegrasyonu henüz bağlı değil.
 * Bu sayfa sahte e-posta göstermez; yetkili yöneticilere kurulum durumunu gösterir.
 */
export default function AdminInboxPage() {
  const { can, role } = useCmsAuth()
  const canManage = role === 'super_admin' || role === 'managing_editor' || can('system:settings')

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="Gelen Kutusu"
        subtitle="info@nahaber.com — Haber merkezi e-posta"
      />

      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <section className="rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-brand))]/10">
            <Mail className="h-6 w-6 text-[rgb(var(--color-brand))]" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">
            Gmail bağlantısı gerekli
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            Haber odası gelen kutusu, <strong className="text-[rgb(var(--color-text))]">info@nahaber.com</strong>{' '}
            hesabını Google OAuth ile güvenli şekilde bağladıktan sonra burada görünecek.
            Şifre saklanmaz; erişim sunucu tarafında token ile yönetilir.
          </p>

          <ul className="mt-5 space-y-2 text-sm text-[rgb(var(--color-muted))]">
            <li className="flex gap-2">
              <span className="text-[rgb(var(--color-brand))]">•</span>
              Gelen mesajları incele
            </li>
            <li className="flex gap-2">
              <span className="text-[rgb(var(--color-brand))]">•</span>
              “Habere Dönüştür” ile onaylı taslak oluştur
            </li>
            <li className="flex gap-2">
              <span className="text-[rgb(var(--color-brand))]">•</span>
              Ekleri medya kütüphanesine aktar
            </li>
          </ul>

          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Sahte e-posta listesi gösterilmez. Bağlantı kurulana kadar bu alan boş kalır —
                böylece editörler gerçek olmayan içeriğe göre karar vermez.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {canManage ? (
              <Link
                href="/admin/settings"
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Ayarlara git
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <p className="text-sm text-[rgb(var(--color-muted))]">
                Bağlantıyı yalnızca süper admin veya sistem ayarı yetkisi olanlar yapılandırabilir.
              </p>
            )}
            <a
              href="https://developers.google.com/gmail/api/guides"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
            >
              Gmail API dokümantasyonu
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

        <section className="rounded-[14px] border border-dashed border-[rgb(var(--color-border))] px-5 py-10 text-center">
          <p className="text-sm font-medium text-[rgb(var(--color-muted))]">
            Bağlı hesap yok — gösterilecek mesaj bulunmuyor.
          </p>
        </section>
      </div>
    </div>
  )
}
