'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertTriangle, Trash2, ShieldAlert } from 'lucide-react'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'
import { ROUTES } from '@/constants/routes'

/**
 * /settings/account/delete — Apple App Store 5.1.1(v) uyumluluğu için
 * uygulama içi hesap silme akışı.
 *
 * Akış:
 *  1) Kullanıcı uyarıları okur, "HESABIMI SİL" ifadesini elle yazar.
 *  2) `auth.currentUser.getIdToken(true)` ile taze ID token alınır.
 *  3) POST /api/account/delete (Bearer <id_token>) çağrılır.
 *  4) Sunucu Firestore user doc + Firebase Auth user'ı siler.
 *  5) İstemci `signOut` yapar ve /login'e yönlendirir.
 *
 * Yeniden kimlik doğrulama gerekirse Firebase hata kodu
 * `auth/requires-recent-login` döner — kullanıcı çıkış yapıp tekrar
 * giriş yapması istenir.
 */
export default function DeleteAccountPage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const expected = 'HESABIMI SİL'
  const canSubmit = confirmation.trim().toLocaleUpperCase('tr-TR') === expected && !busy

  const handleDelete = async () => {
    if (!auth.currentUser) {
      toast.error('Hesabınızı silmek için önce giriş yapın')
      router.push(ROUTES.LOGIN)
      return
    }
    if (!canSubmit) return

    setBusy(true)
    try {
      const token = await auth.currentUser.getIdToken(true)
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = typeof data?.detail === 'string' ? `: ${data.detail}` : ''
        if (res.status === 401) {
          toast.error('Oturum süresi dolmuş — çıkıp tekrar girip deneyin')
          await logout().catch(() => {})
          router.push(ROUTES.LOGIN)
          return
        }
        throw new Error(`Silme başarısız${detail}`)
      }

      // Sunucu Auth user'ı sildi — istemci tarafında da signOut tetikle ve yönlendir
      try {
        await logout()
      } catch {
        // ignore — auth user zaten silindi
      }
      toast.success('Hesabınız silindi')
      router.replace(ROUTES.LOGIN)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
      // Recent-login zorunluluğu Firebase istemci tarafından da gelebilir
      if (/requires-recent-login/i.test(message)) {
        toast.error('Güvenlik için son 5 dakika içinde giriş yapmış olmanız gerekiyor. Çıkıp tekrar giriş yapın.')
      } else {
        toast.error(message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <>
        <SettingsHeader title="Hesabı Sil" backHref={ROUTES.SETTINGS} />
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Hesabınızı silmek için önce giriş yapmalısınız.
          </p>
          <Link
            href={ROUTES.LOGIN}
            className="mt-4 inline-block rounded-xl bg-[rgb(var(--color-brand))] px-5 py-2 text-sm font-bold text-white"
          >
            Giriş Yap
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <SettingsHeader title="Hesabı Sil" backHref={ROUTES.SETTINGS} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Uyarı kutusu */}
        <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h2 className="text-base font-black text-red-300">Bu işlem geri alınamaz</h2>
          </div>
          <p className="text-sm leading-relaxed text-red-200/90">
            Hesabınızı sildiğinizde profiliniz, beğenileriniz, kayıtlı haberleriniz ve
            yorumlarınız ile ilişkili tüm kişisel verileriniz kalıcı olarak silinir. Bu
            işlemi geri alamayız ve aynı kullanıcı adıyla yeniden kayıt olmanız mümkün
            olmayabilir.
          </p>
        </div>

        {/* Neler silinir / saklanır */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-3 text-sm font-bold text-white">Silinecek veriler</h3>
          <ul className="mb-4 space-y-1.5 text-sm text-[rgb(var(--color-muted))]">
            <li className="flex items-start gap-2"><span className="text-red-400">•</span>Profil bilgileriniz (ad, kullanıcı adı, biyografi, fotoğraf)</li>
            <li className="flex items-start gap-2"><span className="text-red-400">•</span>E-posta adresiniz ve giriş yöntemi kayıtları</li>
            <li className="flex items-start gap-2"><span className="text-red-400">•</span>Beğeniler, kaydedilen haberler, takip ettikleriniz</li>
            <li className="flex items-start gap-2"><span className="text-red-400">•</span>Tercihleriniz ve oturum bilgileri</li>
          </ul>

          <h3 className="mb-3 text-sm font-bold text-white">Saklanacak veriler</h3>
          <ul className="space-y-1.5 text-sm text-[rgb(var(--color-muted))]">
            <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Yasal yükümlülük gereği saklanması zorunlu kayıtlar (örn. fatura, vergi mevzuatı) ilgili yasal süre dolana kadar saklanır</li>
            <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Anonim ve toplu istatistikler (kullanıcı kimliğiyle ilişkilendirilemez)</li>
          </ul>
        </section>

        {/* Onay alanı */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <h3 className="text-sm font-bold text-white">Onay</h3>
          </div>
          <p className="mb-3 text-sm text-[rgb(var(--color-muted))]">
            Devam etmek için aşağıdaki kutucuğa{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-red-300">{expected}</code>
            {' '}yazın.
          </p>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={expected}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none ring-red-500/40 transition-all focus:ring-2"
          />
        </section>

        {/* Aksiyon butonları */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={ROUTES.SETTINGS}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Vazgeç
          </Link>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleDelete}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-900/40 disabled:text-red-300/40"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? 'Siliniyor...' : 'Hesabımı Kalıcı Olarak Sil'}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-[rgb(var(--color-muted))]">
          Sorularınız için{' '}
          <a href="mailto:destek@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
            destek@nahaber.com
          </a>
        </p>
      </main>
    </>
  )
}
