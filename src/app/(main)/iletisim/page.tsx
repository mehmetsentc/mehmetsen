import type { Metadata } from 'next'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl  = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://nahaber.com'

export const metadata: Metadata = {
  title: `İletişim | ${siteName}`,
  description: `${siteName} ile iletişime geçin. Editöryal şikayetler, reklam ve iş birliği talepleriniz için bize ulaşın.`,
  alternates: { canonical: `${siteUrl}/iletisim` },
  openGraph: {
    title: `İletişim | ${siteName}`,
    description: `${siteName} ile iletişime geçin.`,
    url: `${siteUrl}/iletisim`,
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: `${siteName} İletişim`,
  url: `${siteUrl}/iletisim`,
  mainEntity: {
    '@type': 'Organization',
    name: siteName,
    url: siteUrl,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'editorial',
        email: 'haber@nahaber.com',
        availableLanguage: 'Turkish',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'iletisim@nahaber.com',
        availableLanguage: 'Turkish',
      },
    ],
  },
}

export default function IletisimPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-6 text-3xl font-bold">İletişim</h1>

        <section className="space-y-8 text-[rgb(var(--color-muted))]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">Editöryal & Haber</h2>
            <p className="mb-2 text-sm">
              Haber düzeltme, bilgi yanlışlığı bildirimi veya basın bülteni göndermek için:
            </p>
            <a
              href="mailto:haber@nahaber.com"
              className="text-[rgb(var(--color-brand))] underline"
            >
              haber@nahaber.com
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">Genel İletişim</h2>
            <p className="mb-2 text-sm">
              Reklam, iş birliği ve diğer konular için:
            </p>
            <a
              href="mailto:iletisim@nahaber.com"
              className="text-[rgb(var(--color-brand))] underline"
            >
              iletisim@nahaber.com
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">Sosyal Medya</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <a href="https://twitter.com/nahabercom" target="_blank" rel="noopener noreferrer" className="text-[rgb(var(--color-brand))] underline">Twitter / X</a>
              <a href="https://www.instagram.com/nahabercom" target="_blank" rel="noopener noreferrer" className="text-[rgb(var(--color-brand))] underline">Instagram</a>
              <a href="https://www.facebook.com/nahabercom" target="_blank" rel="noopener noreferrer" className="text-[rgb(var(--color-brand))] underline">Facebook</a>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
