import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { ContactForm } from '@/components/contact/ContactForm'
import { CONTACT_EMAIL, FOOTER_LEGAL_LINKS } from '@/constants/siteLegalLinks'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

function mailto(subject?: string) {
  const base = `mailto:${CONTACT_EMAIL}`
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base
}

export const metadata: Metadata = {
  title: 'Destek ve İletişim',
  description: `${siteName} iletişim sayfası. ${CONTACT_EMAIL} üzerinden bize ulaşın.`,
  alternates: { canonical: `${siteUrl}/iletisim` },
  openGraph: {
    title: `Destek ve İletişim | ${siteName}`,
    description: `${siteName} ile iletişime geçin.`,
    url: `${siteUrl}/iletisim`,
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: `${siteName} Destek ve İletişim`,
  url: `${siteUrl}/iletisim`,
  mainEntity: {
    '@type': 'Organization',
    name: siteName,
    url: siteUrl,
    email: CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
      availableLanguage: ['Turkish', 'English'],
    },
  },
}

const TOPIC_CHANNELS = [
  {
    title: 'Genel İletişim',
    description: 'Sorularınız, önerileriniz ve geri bildirimleriniz.',
    subject: 'Genel İletişim',
  },
  {
    title: 'Teknik Destek',
    description: 'Hesap, uygulama hatası ve kullanım sorunları.',
    subject: 'Teknik Destek',
  },
  {
    title: 'Editoryal & Düzeltme',
    description: 'Haber düzeltme, bilgi yanlışlığı bildirimi, basın bülteni.',
    subject: 'Haber Düzeltme',
  },
  {
    title: 'KVKK & Gizlilik',
    description: 'Kişisel veri talepleri ve gizlilik başvuruları.',
    subject: 'KVKK Talebi',
  },
  {
    title: 'Reklam & İş Birliği',
    description: 'Reklam, sponsorluk ve içerik ortaklığı talepleri.',
    subject: 'Reklam ve İş Birliği',
  },
] as const

interface FaqEntry {
  q: string
  a: React.ReactNode
}

const FAQ: FaqEntry[] = [
  {
    q: 'Hesabımı nasıl silerim?',
    a: (
      <>
        Uygulamada{' '}
        <Link href="/settings/account/delete" className="font-semibold text-brand-600 underline dark:text-brand-400">
          Ayarlar → Oturum → Hesabı Sil
        </Link>
        {' '}menüsünden hesabınızı doğrudan silebilirsiniz. Sorun yaşarsanız{' '}
        <a className="font-semibold text-brand-600 underline dark:text-brand-400" href={mailto('Hesap Silme Talebi')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine yazın.
      </>
    ),
  },
  {
    q: 'Şifremi unuttum, nasıl sıfırlarım?',
    a: (
      <>
        Giriş ekranındaki <strong className="text-gray-900 dark:text-gray-100">Şifremi Unuttum</strong> bağlantısına
        tıklayın; e-posta adresinize gönderilen bağlantı ile yeni şifrenizi belirleyebilirsiniz.
      </>
    ),
  },
  {
    q: 'Bir haberde yanlış bilgi var, nasıl bildirebilirim?',
    a: (
      <>
        <a className="font-semibold text-brand-600 underline dark:text-brand-400" href={mailto('Haber Düzeltme')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine haberin URL&apos;sini, hatalı kısmı ve doğru bilgiyi yazın.
      </>
    ),
  },
  {
    q: 'Kişisel verilerime ilişkin haklarımı nasıl kullanabilirim?',
    a: (
      <>
        KVKK kapsamındaki talepleriniz için{' '}
        <a className="font-semibold text-brand-600 underline dark:text-brand-400" href={mailto('KVKK Talebi')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine yazın. Detaylar için{' '}
        <Link className="font-semibold text-brand-600 underline dark:text-brand-400" href="/aydinlatma-metni">
          Aydınlatma Metni
        </Link>
        {' '}sayfasına bakabilirsiniz.
      </>
    ),
  },
  {
    q: 'Reklam veya iş birliği için kiminle iletişime geçmeliyim?',
    a: (
      <>
        Reklam ve iş birliği talepleri için{' '}
        <a className="font-semibold text-brand-600 underline dark:text-brand-400" href={mailto('Reklam ve İş Birliği')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine ulaşın.
      </>
    ),
  },
]

function TopicCard({ title, description, subject }: { title: string; description: string; subject: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{description}</p>
      <a
        href={mailto(subject)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
      >
        <Mail className="h-4 w-4" />
        {CONTACT_EMAIL}
      </a>
    </div>
  )
}

export default function IletisimPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 text-gray-900 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-gray-100">
            Destek ve İletişim
          </h1>
          <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">
            Tüm talepleriniz için tek iletişim adresimiz{' '}
            <a
              href={mailto()}
              className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              {CONTACT_EMAIL}
            </a>
            . Formu doldurabilir veya doğrudan e-posta gönderebilirsiniz.
          </p>
        </header>

        <section
          className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
          aria-label="E-posta iletişim"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                E-posta
              </p>
              <a
                href={mailto()}
                className="mt-1 inline-flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
              >
                <Mail className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                {CONTACT_EMAIL}
              </a>
            </div>
            <a
              href={mailto()}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              E-posta Gönder
            </a>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
            İletişim Formu
          </h2>
          <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            Mesajınız doğrudan {CONTACT_EMAIL} adresine iletilir.
          </p>
          <ContactForm />
        </section>

        <section className="mb-10" aria-label="İletişim konuları">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Konuya Göre Yazın</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOPIC_CHANNELS.map((channel) => (
              <TopicCard key={channel.title} {...channel} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Sıkça Sorulan Sorular</h2>
          <div className="space-y-3">
            {FAQ.map((entry, idx) => (
              <details
                key={idx}
                className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 marker:hidden dark:text-gray-100">
                  <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90 dark:text-brand-400">
                    ▸
                  </span>
                  {entry.q}
                </summary>
                <div className="mt-3 pl-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {entry.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <h2 className="mb-2 text-base font-bold text-red-950 dark:text-red-100">
            Hesabınızı Silmek mi İstiyorsunuz?
          </h2>
          <p className="mb-3 text-sm text-red-900/90 dark:text-red-100/90">
            <strong className="font-semibold text-red-950 dark:text-red-50">Ayarlar → Oturum → Hesabı Sil</strong>{' '}
            menüsünden hesabınızı kalıcı olarak silebilirsiniz.
          </p>
          <Link
            href="/settings/account/delete"
            className="mb-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Hesap Silme Sayfasına Git →
          </Link>
          <p className="text-xs text-red-900/80 dark:text-red-200/90">
            Uygulamaya erişiminiz yoksa{' '}
            <a className="font-semibold text-red-800 underline dark:text-red-200" href={mailto('Hesap Silme Talebi')}>
              {CONTACT_EMAIL}
            </a>
            {' '}adresine yazın.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">Sosyal Medya</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'X / Twitter', href: 'https://twitter.com/nahabercom' },
              { label: 'Instagram', href: 'https://www.instagram.com/nahabercom' },
              { label: 'Facebook', href: 'https://www.facebook.com/nahabercom' },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-brand-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/60 dark:text-brand-400 dark:hover:bg-gray-800"
              >
                {s.label}
              </a>
            ))}
          </div>
        </section>

        <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Yasal Belgeler ve Politikalar
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="font-medium text-brand-600 underline hover:no-underline dark:text-brand-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
