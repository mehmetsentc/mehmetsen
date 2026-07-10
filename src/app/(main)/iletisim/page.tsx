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
  title: `Destek ve İletişim | ${siteName}`,
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
        <Link href="/settings/account/delete" className="font-semibold text-[rgb(var(--color-brand))] underline">
          Ayarlar → Oturum → Hesabı Sil
        </Link>
        {' '}menüsünden hesabınızı doğrudan silebilirsiniz. Sorun yaşarsanız{' '}
        <a className="font-semibold text-[rgb(var(--color-brand))] underline" href={mailto('Hesap Silme Talebi')}>
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
        Giriş ekranındaki <strong>Şifremi Unuttum</strong> bağlantısına tıklayın; e-posta
        adresinize gönderilen bağlantı ile yeni şifrenizi belirleyebilirsiniz.
      </>
    ),
  },
  {
    q: 'Bir haberde yanlış bilgi var, nasıl bildirebilirim?',
    a: (
      <>
        <a className="font-semibold text-[rgb(var(--color-brand))] underline" href={mailto('Haber Düzeltme')}>
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
        <a className="font-semibold text-[rgb(var(--color-brand))] underline" href={mailto('KVKK Talebi')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine yazın. Detaylar için{' '}
        <Link className="font-semibold text-[rgb(var(--color-brand))] underline" href="/aydinlatma-metni">
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
        <a className="font-semibold text-[rgb(var(--color-brand))] underline" href={mailto('Reklam ve İş Birliği')}>
          {CONTACT_EMAIL}
        </a>
        {' '}adresine ulaşın.
      </>
    ),
  },
]

function TopicCard({ title, description, subject }: { title: string; description: string; subject: string }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
      <h3 className="text-base font-bold text-[rgb(var(--color-text))]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--color-muted))]">{description}</p>
      <a
        href={mailto(subject)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
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
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-[rgb(var(--color-text))]">
            Destek ve İletişim
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[rgb(var(--color-muted))]">
            Tüm talepleriniz için tek iletişim adresimiz{' '}
            <a
              href={mailto()}
              className="font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . Formu doldurabilir veya doğrudan e-posta gönderebilirsiniz.
          </p>
        </header>

        <section
          className="mb-10 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6"
          aria-label="E-posta iletişim"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
                E-posta
              </p>
              <a
                href={mailto()}
                className="mt-1 inline-flex items-center gap-2 text-xl font-bold text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
              >
                <Mail className="h-5 w-5 text-[rgb(var(--color-brand))]" />
                {CONTACT_EMAIL}
              </a>
            </div>
            <a
              href={mailto()}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              E-posta Gönder
            </a>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="mb-2 text-xl font-bold text-[rgb(var(--color-text))]">
            İletişim Formu
          </h2>
          <p className="mb-4 text-sm text-[rgb(var(--color-muted))]">
            Mesajınız doğrudan {CONTACT_EMAIL} adresine iletilir.
          </p>
          <ContactForm />
        </section>

        <section className="mb-10" aria-label="İletişim konuları">
          <h2 className="mb-4 text-xl font-bold text-[rgb(var(--color-text))]">Konuya Göre Yazın</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOPIC_CHANNELS.map((channel) => (
              <TopicCard key={channel.title} {...channel} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-[rgb(var(--color-text))]">Sıkça Sorulan Sorular</h2>
          <div className="space-y-3">
            {FAQ.map((entry, idx) => (
              <details
                key={idx}
                className="group rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-[rgb(var(--color-text))] marker:hidden">
                  <span className="mr-2 inline-block text-[rgb(var(--color-brand))] transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  {entry.q}
                </summary>
                <div className="mt-3 pl-5 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
                  {entry.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
          <h2 className="mb-2 text-base font-bold text-[rgb(var(--color-text))]">Hesabınızı Silmek mi İstiyorsunuz?</h2>
          <p className="mb-3 text-sm text-[rgb(var(--color-muted))]">
            <strong className="text-[rgb(var(--color-text))]">Ayarlar → Oturum → Hesabı Sil</strong> menüsünden
            hesabınızı kalıcı olarak silebilirsiniz.
          </p>
          <Link
            href="/settings/account/delete"
            className="mb-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Hesap Silme Sayfasına Git →
          </Link>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Uygulamaya erişiminiz yoksa{' '}
            <a className="font-semibold text-[rgb(var(--color-brand))] underline" href={mailto('Hesap Silme Talebi')}>
              {CONTACT_EMAIL}
            </a>
            {' '}adresine yazın.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-bold text-[rgb(var(--color-text))]">Sosyal Medya</h2>
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
                className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-sm font-semibold text-[rgb(var(--color-brand))] hover:bg-[rgb(var(--color-surface))]"
              >
                {s.label}
              </a>
            ))}
          </div>
        </section>

        <section className="border-t border-[rgb(var(--color-border))] pt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            Yasal Belgeler ve Politikalar
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="font-medium text-[rgb(var(--color-brand))] underline hover:no-underline"
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
