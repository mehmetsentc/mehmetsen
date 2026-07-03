'use client'

/**
 * EulaModal — İlk girişte kullanım koşullarını gösterir.
 * Apple Guideline 1.2: UGC içeren uygulamalar için EULA zorunludur.
 * Kullanıcı "Kabul Et" basmadan devam edemez.
 */

import { useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'

interface EulaModalProps {
  onAccept: () => Promise<void>
}

export function EulaModal({ onAccept }: EulaModalProps) {
  const [loading, setLoading] = useState(false)

  const handleAccept = async () => {
    setLoading(true)
    try {
      await onAccept()
      // onAccept başarılı olunca AuthProvider user'ı günceller ve modal kapanır
    } catch (error) {
      console.error('[EulaModal] accept failed:', error)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-2xl bg-[rgb(var(--color-card))] shadow-2xl">
        {/* Başlık */}
        <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-5 py-4">
          <ScrollText className="h-5 w-5 shrink-0 text-blue-500" />
          <h2 className="font-semibold text-[rgb(var(--color-text))]">
            Kullanım Koşulları ve Gizlilik
          </h2>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-[rgb(var(--color-muted))] leading-relaxed space-y-3">
          <p>
            NaHaber&apos;e hoş geldiniz. Uygulamayı kullanmaya devam etmek için aşağıdaki koşulları kabul etmeniz gerekmektedir.
          </p>

          <h3 className="font-semibold text-[rgb(var(--color-text))]">Kullanıcı İçeriği</h3>
          <p>
            Yorum, paylaşım veya başka içerik oluşturduğunuzda, bu içeriğin yasalara ve topluluk kurallarımıza uygun olduğunu kabul etmiş olursunuz.
            Nefret söylemi, taciz, şiddet, yanıltıcı bilgi ve uygunsuz içerik kesinlikle yasaktır.
          </p>

          <h3 className="font-semibold text-[rgb(var(--color-text))]">Moderasyon</h3>
          <p>
            Kuralları ihlal eden içerikler kaldırılabilir; tekrarlayan ihlallerde hesabınız askıya alınabilir.
            Şikayet etmek istediğiniz içerikleri ··· menüsü aracılığıyla bildirebilirsiniz.
          </p>

          <h3 className="font-semibold text-[rgb(var(--color-text))]">Gizlilik</h3>
          <p>
            Kişisel verileriniz yalnızca hizmetin sunulması amacıyla işlenir ve üçüncü taraflarla paylaşılmaz.
            Daha fazla bilgi için{' '}
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
            NaHaber, kullanıcıların oluşturduğu içeriklerden sorumlu değildir. Haber içerikleri
            bilgilendirme amaçlı olup yatırım, hukuki veya tıbbi tavsiye niteliği taşımaz.
          </p>
        </div>

        {/* Butonlar */}
        <div className="border-t border-[rgb(var(--color-border))] p-4">
          <button
            type="button"
            onClick={handleAccept}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </>
            ) : (
              'Okudum, Kabul Ediyorum'
            )}
          </button>
          <p className="mt-2 text-center text-xs text-[rgb(var(--color-muted))]">
            Kabul etmeden uygulamayı kullanamazsınız.
          </p>
        </div>
      </div>
    </div>
  )
}
