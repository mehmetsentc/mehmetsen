'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Shield, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  CONSENT_ACCEPT_ALL,
  CONSENT_REJECT_ALL,
  setConsent,
} from '@/lib/consent'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface CookieConsentModalProps {
  onAccept: () => void
  onReject: () => void
}

/**
 * KVKK / GDPR uyumlu çerez tercihleri modal'ı.
 *
 * App Store Review uyumluluk notu (Apple Guideline 5.1.2(i)):
 *  - "Tracking" kelimesi, "iş ortakları sayısı", "kişiselleştirilmiş reklam"
 *    veya "device fingerprinting" benzeri ifadeler bu UI'da yer ALMAZ.
 *  - NaHaber üçüncü taraflarla reklam/pazarlama amaçlı veri paylaşmaz,
 *    veri brokerlarına satmaz; dolayısıyla App Tracking Transparency
 *    permission prompt'u tetikleyici hiçbir veri toplanmaz.
 *  - Bu modal yalnızca **web tarayıcı bağlamında** gösterilir — iOS native
 *    Capacitor shell'de tamamen gizlenir (ConsentStrip.tsx içinde guard).
 */

// Sadece 2 kategori — KVKK/GDPR opt-in gereksinimi için minimum set.
const PURPOSES = [
  {
    id: 'necessary' as const,
    title: 'Zorunlu Çerezler',
    description:
      'Oturum açma, güvenlik ve temel platform işlevleri için gereklidir. Her zaman etkin olup kapatılamaz.',
    always: true,
  },
  {
    id: 'analytics' as const,
    title: 'Anonim Kullanım İstatistikleri',
    description:
      'Platformun nasıl kullanıldığını anlamak için sayfa görüntülenme ve gezinme verileri toplu ve anonim olarak işlenir. Bu veriler üçüncü taraf reklamverenlerle paylaşılmaz.',
    always: false,
  },
] as const

type PurposeId = (typeof PURPOSES)[number]['id']

export function CookieConsentModal({ onAccept, onReject }: CookieConsentModalProps) {
  const [view, setView] = useState<'main' | 'purposes'>('main')
  const [expanded, setExpanded] = useState<PurposeId | null>(null)
  const [enabled, setEnabled] = useState<Record<PurposeId, boolean>>({
    necessary: true,
    analytics: false,
  })

  const saveCustom = useCallback(() => {
    setConsent({
      necessary: true,
      analytics: enabled.analytics,
      marketing: false,
      sale: false,
    })
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

  // ── "Tercihleri Yönet" görünümü ─────────────────────────────────
  if (view === 'purposes') {
    return (
      <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
          <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-5 py-4">
            <Shield className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            <h2 className="flex-1 text-base font-black text-[rgb(var(--color-text))]">
              Çerez Tercihleri
            </h2>
            <button
              type="button"
              onClick={() => setView('main')}
              className="text-xs font-semibold text-[rgb(var(--color-brand))]"
            >
              ← Geri
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {PURPOSES.map((p) => (
              <div key={p.id} className="border-b border-[rgb(var(--color-border))]">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
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

            <div className="px-5 py-4">
              <p className="text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                NaHaber, kişisel verilerinizi üçüncü taraf reklamverenlere satmaz veya pazarlama
                amaçlı paylaşmaz. Detaylar için{' '}
                <Link
                  href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/settings/privacy-policy'}
                  target="_blank"
                  className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
                >
                  Gizlilik Politikası
                </Link>
                .
              </p>
            </div>
          </div>

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
                Sadece Zorunlu Çerezler
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Ana görünüm — sade KVKK aydınlatması ───────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--color-surface))] shadow-2xl sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--color-brand))]/10">
              <Shield className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </div>
            <h2 className="text-lg font-black text-[rgb(var(--color-text))]">
              Çerez Kullanımı
            </h2>
          </div>

          <p className="mb-4 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            NaHaber, sitenin temel işlevlerini sağlamak ve anonim kullanım istatistiklerini ölçmek
            için çerez kullanır. <strong className="text-[rgb(var(--color-text))]">
            Verilerinizi üçüncü taraf reklamverenlere satmıyor veya pazarlama amacıyla
            paylaşmıyoruz.</strong>
          </p>

          <div className="mb-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Çerezler ne için kullanılır:
            </p>
            <ul className="space-y-1.5 text-xs text-[rgb(var(--color-muted))]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Oturum açma ve güvenlik (zorunlu)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Tercihlerinizin hatırlanması (tema, dil)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[rgb(var(--color-brand))]">•</span>
                Anonim ve toplu kullanım istatistikleri (opsiyonel)
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => setView('purposes')}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-[rgb(var(--color-border))] px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--color-card))]"
          >
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Tercihleri Yönet
            </span>
            <ChevronDown className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>

          <p className="text-xs text-[rgb(var(--color-muted))]">
            Seçiminizi her zaman Ayarlar → Gizlilik bölümünden değiştirebilirsiniz.{' '}
            <Link
              href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/settings/privacy-policy'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              Gizlilik Politikası
            </Link>
            {' · '}
            <Link
              href="/aydinlatma-metni"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              KVKK Aydınlatma Metni
            </Link>
          </p>
        </div>

        <div className="border-t border-[rgb(var(--color-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="w-full rounded-2xl bg-[rgb(var(--color-brand))] py-3.5 text-sm font-black text-white shadow-lg shadow-[rgb(var(--color-brand))]/20 transition-colors hover:bg-red-700"
            >
              Kabul Et
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="w-full rounded-2xl border border-[rgb(var(--color-border))] py-3.5 text-sm font-bold text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              Sadece Zorunlu Çerezler
            </button>
            <button
              type="button"
              onClick={() => setView('purposes')}
              className="w-full rounded-2xl border border-[rgb(var(--color-border))] py-3.5 text-sm font-bold text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-card))]"
            >
              Tercihleri Yönet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
