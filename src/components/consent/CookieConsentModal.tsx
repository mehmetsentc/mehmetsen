'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ExternalLink, Shield, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  CONSENT_ACCEPT_ALL,
  CONSENT_REJECT_ALL,
  setConsent,
  type ConsentCategories,
} from '@/lib/consent'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface CookieConsentModalProps {
  onAccept: () => void
  onReject: () => void
}

// ── Purpose definitions (KVKK/GDPR uyumlu Türkçe) ──────────────
const PURPOSES = [
  {
    id: 'necessary' as const,
    title: 'Zorunlu Çerezler',
    description:
      'Oturum açma, güvenlik ve temel platform işlevleri için gereklidir. Her zaman etkin olup kapatılamaz. Bunlar olmadan site düzgün çalışmaz.',
    always: true,
  },
  {
    id: 'analytics' as const,
    title: 'Analitik ve Ölçüm',
    description:
      'Platformun nasıl kullanıldığını anlamamıza yardımcı olur. Sayfa görüntüleme, tıklama ve gezinme verileri toplanır; veriler toplu ve anonim biçimde işlenir.',
    always: false,
  },
  {
    id: 'marketing' as const,
    title: 'Kişiselleştirme ve Pazarlama',
    description:
      'İlgi alanlarınıza göre içerik ve haber önerileri sunmak için kullanılır. Çevrimiçi davranışınıza dayalı profiller oluşturulabilir.',
    always: false,
  },
] as const

type PurposeId = (typeof PURPOSES)[number]['id']

// ── Partner count shown in modal ─────────────────────────────────
const PARTNER_COUNT = 48

export function CookieConsentModal({ onAccept, onReject }: CookieConsentModalProps) {
  const [view, setView] = useState<'main' | 'purposes'>('main')
  const [expanded, setExpanded] = useState<PurposeId | null>(null)
  const [enabled, setEnabled] = useState<Record<PurposeId, boolean>>({
    necessary: true,
    analytics: false,
    marketing: false,
  })

  const saveCustom = useCallback(() => {
    const cats: ConsentCategories = {
      necessary: true,
      analytics: enabled.analytics,
      marketing: enabled.marketing,
      sale: enabled.marketing,
    }
    setConsent(cats)
    onAccept()
  }, [enabled, onAccept])

  const handleAcceptAll = useCallback(() => {
    setConsent(CONSENT_ACCEPT_ALL)
    onAccept()
  }, [onAccept])

  const handleRejectAll = useCallback(() => {
    setConsent(CONSENT_REJECT_ALL)
    onReject()
  }, [onReject])

  const toggle = (id: PurposeId) => {
    if (id === 'necessary') return
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ── "Amaçları Göster" görünümü ──────────────────────────────────
  if (view === 'purposes') {
    return (
      <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-5 py-4">
            <Shield className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            <h2 className="flex-1 text-base font-black text-[rgb(var(--color-text))]">
              Amaçları Yönet
            </h2>
            <button
              type="button"
              onClick={() => setView('main')}
              className="text-xs font-semibold text-[rgb(var(--color-brand))]"
            >
              ← Geri
            </button>
          </div>

          {/* Purpose list */}
          <div className="flex-1 overflow-y-auto">
            {PURPOSES.map((p) => (
              <div key={p.id} className="border-b border-[rgb(var(--color-border))]">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  {/* Toggle */}
                  <span
                    onClick={(e) => { e.stopPropagation(); toggle(p.id) }}
                    className={cn('shrink-0 transition-colors', p.always ? 'opacity-40' : 'cursor-pointer')}
                  >
                    {enabled[p.id] ? (
                      <ToggleRight className="h-7 w-7 text-[rgb(var(--color-brand))]" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-[rgb(var(--color-muted))]" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[rgb(var(--color-text))]">{p.title}</p>
                    {p.always && (
                      <p className="text-[11px] text-[rgb(var(--color-muted))]">Her zaman etkin</p>
                    )}
                  </div>

                  {expanded === p.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
                  )}
                </button>

                {expanded === p.id && (
                  <div className="px-5 pb-4">
                    <p className="text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                      {p.description}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Partner count */}
            <div className="px-5 py-4">
              <p className="text-xs text-[rgb(var(--color-muted))]">
                Biz ve{' '}
                <span className="font-bold text-[rgb(var(--color-text))]">{PARTNER_COUNT}</span>{' '}
                iş ortağımız, cihazınızda tarama verileri gibi kişisel verileri depolayabilir.{' '}
                <Link
                  href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/settings/privacy-policy'}
                  target="_blank"
                  className="inline-flex items-center gap-0.5 font-semibold text-[rgb(var(--color-brand))] hover:underline"
                >
                  İş Ortakları Listesi
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="border-t border-[rgb(var(--color-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={saveCustom}
                className="w-full rounded-2xl bg-[rgb(var(--color-brand))] py-3.5 text-sm font-black text-white transition-colors hover:bg-red-700"
              >
                Seçimlerimi Kaydet
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                className="w-full rounded-2xl border border-[rgb(var(--color-border))] py-3.5 text-sm font-bold text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-card))]"
              >
                Tümünü Reddet
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Ana görünüm ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Icon + title */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--color-brand))]/10">
              <Shield className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </div>
            <h2 className="text-lg font-black text-[rgb(var(--color-text))]">
              Gizliliğinizi Önemsiyoruz
            </h2>
          </div>

          {/* Description */}
          <p className="mb-4 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            Biz ve{' '}
            <span className="font-bold text-[rgb(var(--color-text))]">{PARTNER_COUNT}</span>{' '}
            iş ortağımız, cihazınızda tarama verileri veya benzersiz tanımlayıcılar gibi kişisel
            verileri depolarız ve bunlara erişiriz. <strong className="text-[rgb(var(--color-text))]">Kabul ediyorum</strong>'u
            seçmeniz, bu teknolojilerin veri işleme amaçlarını desteklemesini sağlar.{' '}
            <strong className="text-[rgb(var(--color-text))]">Tümünü Reddet</strong>'i seçmeniz
            veya onayınızı geri çekmeniz bunları devre dışı bırakacaktır.
          </p>

          {/* Data use purposes summary */}
          <div className="mb-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Veriler şu amaçlarla işlenir:
            </p>
            <ul className="space-y-1.5 text-xs text-[rgb(var(--color-muted))]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Kesin coğrafi konum verilerini kullanmak
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Belirleme amacı ile cihaz özelliklerini aktif şekilde taramak
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Bilgileri bir cihazda depolamak ve/veya erişmek
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Kişiselleştirilmiş içerik, içerik ölçümü ve hedef kitle araştırması
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Hizmetlerin geliştirilmesi
              </li>
            </ul>
          </div>

          {/* Manage purposes link */}
          <button
            type="button"
            onClick={() => setView('purposes')}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-[rgb(var(--color-border))] px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--color-card))]"
          >
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Amaçları Göster
            </span>
            <ChevronDown className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>

          {/* Privacy policy link */}
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Seçimlerinizi değiştirmek için Ayarlar → Gizlilik bölümünden her zaman bu menüye
            dönebilirsiniz.{' '}
            <Link
              href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/settings/privacy-policy'}
              className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              Gizlilik Politikası
            </Link>
            {' · '}
            <Link
              href="/aydinlatma-metni"
              className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              KVKK Aydınlatma Metni
            </Link>
          </p>
        </div>

        {/* Action buttons */}
        <div className="border-t border-[rgb(var(--color-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="w-full rounded-2xl bg-[rgb(var(--color-brand))] py-3.5 text-sm font-black text-white shadow-lg shadow-[rgb(var(--color-brand))]/20 transition-colors hover:bg-red-700"
            >
              Kabul ediyorum
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="w-full rounded-2xl border border-[rgb(var(--color-border))] py-3.5 text-sm font-bold text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              Tümünü Reddet
            </button>
            <button
              type="button"
              onClick={() => setView('purposes')}
              className="w-full rounded-2xl border border-[rgb(var(--color-border))] py-3.5 text-sm font-bold text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              Amaçları Göster
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
