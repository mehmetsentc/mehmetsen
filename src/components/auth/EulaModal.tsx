'use client'

/**
 * EulaModal — İlk girişte kullanım koşullarını gösterir.
 * Apple Guideline 1.2: UGC içeren uygulamalar için EULA zorunludur.
 * Kullanıcı "Kabul Et" basmadan devam edemez.
 *
 * App Store 2.1(a) fix: MobileNav (z-105) ve diğer chrome katmanlarının
 * üstünde portal + yüksek z-index; safe-area; 44pt hit target; tüm satır
 * checkbox toggle; scrollable sheet.
 */

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ScrollText } from 'lucide-react'

interface EulaModalProps {
  onAccept: () => Promise<void>
}

export function EulaModal({ onAccept }: EulaModalProps) {
  const [mounted, setMounted] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkboxId = useId()
  const titleId = useId()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
    }
  }, [mounted])

  const handleAccept = async () => {
    if (!agreed || loading) return
    setLoading(true)
    setError(null)
    try {
      await onAccept()
      // onAccept başarılı olunca AuthProvider user'ı günceller ve modal kapanır
    } catch (err) {
      console.error('[EulaModal] accept failed:', err)
      setError('Kabul kaydedilemedi. Lütfen tekrar deneyin.')
      setLoading(false)
    }
  }

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-eula-modal="true"
    >
      {/* Backdrop — pointer events stay on overlay so nothing underneath receives taps */}
      <div className="absolute inset-0" aria-hidden="true" />

      <div
        className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:rounded-2xl"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Başlık */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[rgb(var(--color-border))] px-5 py-4">
          <ScrollText className="h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />
          <h2 id={titleId} className="font-semibold text-[rgb(var(--color-text))]">
            Kullanım Koşulları ve Gizlilik
          </h2>
        </div>

        {/* Scrollable içerik */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed text-[rgb(var(--color-muted))] [-webkit-overflow-scrolling:touch]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="space-y-3">
            <p>
              NaHaber&apos;e hoş geldiniz. Uygulamayı kullanmaya devam etmek için aşağıdaki
              koşulları kabul etmeniz gerekmektedir.
            </p>

            <h3 className="font-semibold text-[rgb(var(--color-text))]">Kullanıcı İçeriği</h3>
            <p>
              Yorum, paylaşım veya başka içerik oluşturduğunuzda, bu içeriğin yasalara ve
              topluluk kurallarımıza uygun olduğunu kabul etmiş olursunuz. Nefret söylemi,
              taciz, şiddet, yanıltıcı bilgi ve uygunsuz içerik kesinlikle yasaktır.
            </p>

            <h3 className="font-semibold text-[rgb(var(--color-text))]">Moderasyon</h3>
            <p>
              Kuralları ihlal eden içerikler kaldırılabilir; tekrarlayan ihlallerde hesabınız
              askıya alınabilir. Şikayet etmek istediğiniz içerikleri ··· menüsü aracılığıyla
              bildirebilirsiniz.
            </p>

            <h3 className="font-semibold text-[rgb(var(--color-text))]">Gizlilik</h3>
            <p>
              Kişisel verileriniz yalnızca hizmetin sunulması amacıyla işlenir ve üçüncü
              taraflarla paylaşılmaz. Daha fazla bilgi için{' '}
              <a
                href="https://nahaber.com/gizlilik"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                Gizlilik Politikamızı
              </a>{' '}
              inceleyebilirsiniz.
            </p>

            <h3 className="font-semibold text-[rgb(var(--color-text))]">Sorumluluk Reddi</h3>
            <p>
              NaHaber, kullanıcıların oluşturduğu içeriklerden sorumlu değildir. Haber
              içerikleri bilgilendirme amaçlı olup yatırım, hukuki veya tıbbi tavsiye niteliği
              taşımaz.
            </p>
          </div>
        </div>

        {/* Footer — always visible above home indicator / bottom chrome */}
        <div className="shrink-0 space-y-3 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-5 pb-4 pt-3">
          <label
            htmlFor={checkboxId}
            className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-3 active:bg-[rgb(var(--color-border))]/40"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-[rgb(var(--color-border))] text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm leading-snug text-[rgb(var(--color-text))]">
              Kullanım koşullarını ve gizlilik politikasını okudum, kabul ediyorum.
            </span>
          </label>

          {error ? (
            <p className="text-center text-xs text-red-500" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleAccept}
            disabled={!agreed || loading}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Kaydediliyor…
              </>
            ) : (
              'Okudum, Kabul Ediyorum'
            )}
          </button>
          <p className="pb-1 text-center text-xs text-[rgb(var(--color-muted))]">
            Kabul etmeden uygulamayı kullanamazsınız.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
