import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/seo'
import { InstallNowButton } from '@/components/pwa/InstallNowButton'
import { AppDownloadQR } from '@/components/pwa/AppDownloadQR'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'NaHaber Uygulamasını İndir — iPhone, Android & Masaüstü',
  description:
    'NaHaber\'i ana ekranınıza yükleyin: anında bildirimler, çevrimdışı okuma, hızlı erişim. App Store, Play Store ve doğrudan tarayıcıdan tek tıkla.',
  alternates: {
    canonical: `${siteUrl}/uygulama`,
  },
  openGraph: {
    title: 'NaHaber Uygulamasını İndir',
    description:
      'Türkiye\'nin anlık haber platformu NaHaber artık cebinizde. Bildirimler, çevrimdışı okuma, kişisel akış.',
    url: `${siteUrl}/uygulama`,
    images: [
      {
        url: `${siteUrl}/brand/og-default.png`,
        width: 1200,
        height: 630,
        alt: 'NaHaber Uygulama',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NaHaber Uygulamasını İndir',
    description:
      'Türkiye\'nin anlık haber platformu artık cebinizde.',
  },
}

const mobileApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'MobileApplication',
  name: 'NaHaber',
  operatingSystem: 'ANDROID, IOS, WINDOWS, MACOS, LINUX',
  applicationCategory: 'NewsApplication',
  applicationSubCategory: 'News',
  url: `${siteUrl}/uygulama`,
  installUrl: `${siteUrl}/uygulama`,
  downloadUrl: `${siteUrl}/uygulama`,
  inLanguage: 'tr-TR',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '1284',
    bestRating: '5',
    worstRating: '1',
  },
  screenshot: [
    `${siteUrl}/brand/screenshot-feed-mobile.png`,
    `${siteUrl}/brand/screenshot-article-mobile.png`,
  ],
  publisher: {
    '@type': 'Organization',
    name: 'NaHaber',
    url: siteUrl,
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'Uygulamayı İndir', item: `${siteUrl}/uygulama` },
  ],
}

export default function AppDownloadPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(mobileApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <header className="mb-10 text-center">
        <div
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            boxShadow: '0 25px 60px -15px rgba(220, 38, 38, 0.5)',
          }}
        >
          <span className="text-4xl font-black text-white">N</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-text-primary sm:text-5xl">
          NaHaber&apos;ı ana ekranına ekle
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-text-secondary sm:text-lg">
          Anlık bildirimler, çevrimdışı okuma ve uygulamanın hızlı versiyonu. Android&apos;de tek dokunuş;
          iPhone&apos;da Safari → Ana Ekrana Ekle.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <InstallNowButton />
          <Link
            href="#yontemler"
            className="rounded-full border border-border bg-bg-card px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
          >
            Diğer yöntemler
          </Link>
        </div>

        <p className="mt-4 text-xs text-text-tertiary">
          Tamamen ücretsiz · 3 MB · Reklamsız kurulum · Cihazına özel
        </p>
      </header>

      {/* Features grid */}
      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-2xl border border-border bg-bg-card p-5"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-2xl">
              {feature.icon}
            </div>
            <h3 className="mb-1 text-base font-bold text-text-primary">{feature.title}</h3>
            <p className="text-sm text-text-secondary">{feature.desc}</p>
          </article>
        ))}
      </section>

      {/* QR + cross-device */}
      <section className="mb-12 rounded-3xl border border-border bg-bg-card p-6 sm:p-8">
        <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
          <AppDownloadQR url={`${siteUrl}/feed?utm_source=qr-app-page`} />
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              Telefonundan açmak için QR kodu tara
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Masaüstündeyken QR kodu telefon kameran ile tara — NaHaber tarayıcıda
              açılır, sonra <strong>Ana Ekrana Ekle</strong> diyerek uygulama olarak yükleyebilirsin.
            </p>
            <p className="mt-3 text-xs text-text-tertiary">
              QR kodu çalışmıyorsa: <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">{siteUrl.replace('https://', '')}</code>
            </p>
          </div>
        </div>
      </section>

      {/* Platform-specific install methods */}
      <section id="yontemler" className="mb-12 space-y-5">
        <h2 className="text-2xl font-bold text-text-primary">Cihazına göre yükleme</h2>

        <InstallStep
          platform="iOS / iPhone & iPad"
          icon="🍎"
          steps={[
            'Safari\'de www.nahaber.com adresini aç',
            'Alt çubuktaki Paylaş ikonuna dokun',
            'Aşağı kaydır → "Ana Ekrana Ekle"',
            'Sağ üstte "Ekle" diyerek onayla',
          ]}
        />

        <InstallStep
          platform="Android (Chrome, Samsung Internet, Edge)"
          icon="🤖"
          steps={[
            'Tarayıcıda www.nahaber.com\'u aç',
            'Sayfa altında çıkan "Uygulamayı yükle" banner\'ına dokun',
            'Veya: Tarayıcı menüsünden "Ana ekrana ekle" / "Uygulamayı yükle" seç',
            'Onayla — NaHaber simgesi ana ekranına yerleşir',
          ]}
        />

        <InstallStep
          platform="Masaüstü (Chrome, Edge, Brave)"
          icon="💻"
          steps={[
            'Tarayıcıda www.nahaber.com\'u aç',
            'Adres çubuğunun sağındaki ⊕ kurulum ikonuna tıkla',
            'Veya: Menü → "NaHaber\'i Yükle"',
            'Pencere kendi başına bir uygulama gibi açılır',
          ]}
        />

        <InstallStep
          platform="Samsung Internet & diğer mobil tarayıcılar"
          icon="📱"
          steps={[
            'NaHaber\'i tarayıcıda aç',
            'Menü (⋮) → "Sayfayı şuraya ekle" → "Ana ekran"',
            'NaHaber adıyla onayla',
          ]}
        />
      </section>

      {/* Why install */}
      <section className="mb-12 rounded-3xl border border-border bg-gradient-to-br from-brand-500/5 to-transparent p-6 sm:p-8">
        <h2 className="mb-4 text-2xl font-bold text-text-primary">Neden yükleyesin?</h2>
        <ul className="space-y-3 text-sm text-text-secondary">
          {BENEFITS.map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-500">
                {i + 1}
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-bg-subtle p-4 text-center text-xs text-text-tertiary">
        App Store ve Google Play sürümlerimiz yakında — şimdilik web uygulaması olarak
        yüklediğiniz NaHaber, native uygulama ile aynı hızda çalışır ve otomatik güncellenir.
      </section>
    </div>
  )
}

interface InstallStepProps {
  platform: string
  icon: string
  steps: string[]
}

function InstallStep({ platform, icon, steps }: InstallStepProps) {
  return (
    <details className="group rounded-2xl border border-border bg-bg-card open:bg-bg-subtle/40">
      <summary className="flex cursor-pointer items-center gap-3 p-4 list-none">
        <span className="text-2xl">{icon}</span>
        <span className="flex-1 text-base font-semibold text-text-primary">{platform}</span>
        <span className="text-xs text-text-tertiary group-open:hidden">Adımları göster ▾</span>
        <span className="text-xs text-text-tertiary hidden group-open:inline">Gizle ▴</span>
      </summary>
      <ol className="space-y-2 px-5 pb-5 text-sm text-text-secondary">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

const FEATURES = [
  { icon: '🔔', title: 'Anlık bildirimler', desc: 'Son dakika ve takip ettiğin kategorilerde push bildirim al.' },
  { icon: '⚡', title: 'Şimşek hızı', desc: 'Service Worker + offline cache ile anında açılan akış.' },
  { icon: '📵', title: 'Çevrimdışı oku', desc: 'İnternet yokken bile son okuduğun haberler erişilebilir.' },
  { icon: '🎯', title: 'Kişisel akış', desc: 'AI editör ilgi alanlarına göre haberleri öne çıkarır.' },
  { icon: '🌙', title: 'OLED Dark', desc: 'Tam siyah karanlık mod — gece okurken pil dostu.' },
  { icon: '🇹🇷', title: 'Tamamen Türkçe', desc: 'Yerel haberler, KVKK uyumlu, Türk yapımı.' },
]

const BENEFITS = [
  'Her açılışta haber sayfasına 2 saniyede ulaş — tarayıcı sekmesi açmadan.',
  'Push bildirimleri ile son dakika haberlerini ilk sen oku (e-posta abonelik yerine).',
  'Reklamsız ve sade okuma deneyimi — sayfa altta otomatik geçişler yok.',
  'Profilin, yer imlerin, okuma listen tüm cihazlarda otomatik senkron.',
  'iOS ve Android\'de ana ekrana yerleşir, açıldığında native uygulama gibi davranır.',
  'Sıfır mağaza onayı — yarın yeni özellik canlıya çıkarsa aynı gün otomatik güncellenir.',
]
