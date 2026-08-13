import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Kendi Facebook App Nasıl Oluşturulur',
  description:
    'NaHaber Social Publisher için kendi Facebook uygulamanızı oluşturma adımları. Paylaşımlarda marka adı görünür, erişim artar.',
  alternates: { canonical: `${siteUrl}/docs/kendi-facebook-app-nasil-olusturulur` },
}

const STEPS = [
  {
    title: 'developers.facebook.com’a girin',
    body: 'Meta for Developers hesabınızla giriş yapın. Sayfa yöneticisi olduğunuz Facebook hesabını kullanın.',
  },
  {
    title: 'Create App',
    body: 'My Apps → Create App. Kullanım tipi olarak Business (İşletme) seçin.',
  },
  {
    title: 'Display Name',
    body: 'Display Name alanına site adınız + “Publisher” yazın. Örnek: Onyeditivi Publisher. Bu isim postların altında “X paylaştı” olarak görünür.',
  },
  {
    title: 'Facebook Login ekleyin',
    body: 'App Dashboard → Add Product → Facebook Login (Web). Valid OAuth Redirect URIs listesine şunu ekleyin: https://www.nahaber.com/api/admin/social/facebook-app/callback',
  },
  {
    title: 'İzinler',
    body: 'İstenecek izinler: pages_manage_posts, pages_show_list, pages_read_engagement, pages_manage_metadata. Geliştirme (Dev) modunda kendi sayfanıza post atabilirsiniz; canlıda App Review gerekebilir.',
  },
  {
    title: 'App ID ve App Secret',
    body: 'Settings → Basic → App ID ve App Secret’ı kopyalayın. Secret’ı asla genel sohbete / git’e yazmayın.',
  },
  {
    title: 'NaHaber admin’e bağlayın',
    body: 'Admin → Sosyal Medya → “Kendi Facebook Uygulamanı Bağla”. App ID, Secret ve Display Name’i kaydedin. Ardından “Sayfa Token Al (OAuth)” ile Page Access Token üretin.',
  },
  {
    title: 'Doğrulama',
    body: 'Test paylaşımı yapın. Facebook’ta postun altında “NaHaber Social Publisher paylaştı” yerine “Onyeditivi Publisher paylaştı” (veya sizin Display Name) görünmeli.',
  },
] as const

export default function KendiFacebookAppDocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="mb-2 text-sm font-medium text-[rgb(var(--color-muted))]">
        <Link href="/admin/social" className="hover:underline">
          Sosyal Medya
        </Link>
        {' · '}
        Dokümantasyon
      </p>
      <h1 className="mb-3 text-3xl font-bold text-[rgb(var(--color-text))]">
        Kendi Facebook Uygulamanı Nasıl Oluşturursun?
      </h1>
      <p className="mb-8 text-base text-[rgb(var(--color-muted))]">
        Tek bir ortak Meta App ile tüm sitelere post atmak, Facebook’ta “NaHaber Social Publisher
        paylaştı” etiketi ve düşük organik erişim üretir. Her yayıncı sitesi kendi App’ini bağladığında
        postlar kendi markasıyla görünür.
      </p>

      <ol className="space-y-6">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5"
          >
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Adım {i + 1}
            </p>
            <h2 className="mb-2 text-lg font-bold text-[rgb(var(--color-text))]">{step.title}</h2>
            <p className="text-sm leading-relaxed text-[rgb(var(--color-muted))]">{step.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-10 rounded-2xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/40">
        <h2 className="mb-2 text-base font-bold text-[rgb(var(--color-text))]">
          Bugün hemen (kod Display Name değiştiremez)
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[rgb(var(--color-muted))]">
          <li>
            <a
              href="https://developers.facebook.com/apps/"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              developers.facebook.com/apps
            </a>{' '}
            → kullanılan App (global NaHaber Social Publisher) → Settings → Basic
          </li>
          <li>
            Display Name’i <strong>Onyeditivi Publisher</strong> veya <strong>Publisher</strong> yapın →
            Save Changes
          </li>
          <li>
            Yeni postlarda etiket değişir. Eski postlar eski etiketi tutabilir.
          </li>
        </ol>
        <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">
          Kalıcı çözüm: kendi App’inizi Admin’e bağlayın veya Vercel env{' '}
          <code className="rounded bg-[rgb(var(--color-surface))] px-1 text-xs">ONYEDITIVI_FB_APP_ID</code> +{' '}
          <code className="rounded bg-[rgb(var(--color-surface))] px-1 text-xs">ONYEDITIVI_FB_PAGE_ACCESS_TOKEN</code>{' '}
          (token bu App’ten üretilmiş olmalı).
        </p>
      </section>

      <p className="mt-8 text-sm text-[rgb(var(--color-muted))]">
        {siteName} ·{' '}
        <a
          href="https://developers.facebook.com/apps/"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          developers.facebook.com/apps
        </a>
      </p>
    </main>
  )
}
