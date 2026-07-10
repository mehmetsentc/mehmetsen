import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from '@/components/contact/ContactForm'
import { CONTACT_EMAIL, FOOTER_LEGAL_LINKS } from '@/constants/siteLegalLinks'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: `Destek ve İletişim | ${siteName}`,
  description: `${siteName} destek sayfası. Sıkça sorulan sorular, hesap silme, editöryal düzeltme, gizlilik ve iletişim bilgileri.`,
  alternates: { canonical: `${siteUrl}/iletisim` },
  openGraph: {
    title: `Destek ve İletişim | ${siteName}`,
    description: `${siteName} ile iletişime geçin, sıkça sorulan sorulara cevap bulun.`,
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
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: CONTACT_EMAIL,
        availableLanguage: ['Turkish', 'English'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'editorial',
        email: 'haber@nahaber.com',
        availableLanguage: 'Turkish',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'privacy',
        email: 'kvkk@nahaber.com',
        availableLanguage: 'Turkish',
      },
    ],
  },
}

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
        <Link href="/settings/account/delete" className="text-[rgb(var(--color-brand))] underline">
          <strong>Ayarlar → Oturum → Hesabı Sil</strong>
        </Link>
        {' '}menüsünden hesabınızı doğrudan silebilirsiniz. İşlem geri alınamaz ve profiliniz,
        beğenileriniz, kayıtlı haberleriniz dahil tüm kişisel verileriniz kalıcı olarak
        kaldırılır. Sorun yaşarsanız{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:destek@nahaber.com?subject=Hesap%20Silme%20Talebi">
          destek@nahaber.com
        </a>
        {' '}adresine yazın; en geç 30 gün içinde silme tamamlanır. Yasal saklama yükümlülüğü
        olan kayıtlar (örn. fatura, vergi mevzuatı kaynaklı veriler) ilgili yasal süre dolana
        kadar saklanır.
      </>
    ),
  },
  {
    q: 'Şifremi unuttum, nasıl sıfırlarım?',
    a: (
      <>
        Giriş ekranındaki <strong>"Şifremi Unuttum"</strong> bağlantısına tıklayın; e-posta
        adresinize gönderilen bağlantı ile yeni şifrenizi belirleyebilirsiniz. Bağlantı 1 saat
        süreyle geçerlidir.
      </>
    ),
  },
  {
    q: 'Bir haberde yanlış bilgi var, nasıl bildirebilirim?',
    a: (
      <>
        Editöryal düzeltme talepleri için{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:haber@nahaber.com?subject=Haber%20D%C3%BCzeltme">
          haber@nahaber.com
        </a>
        {' '}adresine ulaşın. E-postanızda haberin URL'sini, hatalı kısmı ve doğru bilgiyi
        kaynağıyla birlikte belirtmeniz inceleme süresini kısaltır.
      </>
    ),
  },
  {
    q: 'Uygulamada bildirimleri nasıl açıp kapatabilirim?',
    a: (
      <>
        <strong>Ayarlar → Bildirimler</strong> menüsünden istediğiniz bildirim kategorilerini
        ayrı ayrı açıp kapatabilirsiniz. iOS'ta cihaz ayarlarındaki bildirim tercihleri de
        geçerlidir.
      </>
    ),
  },
  {
    q: 'Bir kullanıcıyı / yorumu nasıl şikayet ederim?',
    a: (
      <>
        Şikayet etmek istediğiniz yorumun yanındaki <strong>...</strong> menüsünden{' '}
        <strong>"Şikayet et"</strong> seçeneğini kullanın. Toplu raporlama veya acil durumlar
        için{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:destek@nahaber.com?subject=%C5%9Eikayet">
          destek@nahaber.com
        </a>
        {' '}adresine yazın; içerik 24 saat içinde incelenir.
      </>
    ),
  },
  {
    q: 'Kişisel verilerime ilişkin haklarımı nasıl kullanabilirim?',
    a: (
      <>
        KVKK kapsamında verilerinizin işlenmesine ilişkin tüm haklarınızı{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:kvkk@nahaber.com">
          kvkk@nahaber.com
        </a>
        {' '}adresine yazarak kullanabilirsiniz. Detaylar için{' '}
        <Link className="text-[rgb(var(--color-brand))] underline" href="/aydinlatma-metni">
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
        Reklam, sponsorluk ve iş birliği talepleri için{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:iletisim@nahaber.com">
          iletisim@nahaber.com
        </a>
        {' '}adresine ulaşın.
      </>
    ),
  },
  {
    q: 'Uygulamada bir hata gördüm, nereye bildiririm?',
    a: (
      <>
        Hata raporları için{' '}
        <a className="text-[rgb(var(--color-brand))] underline" href="mailto:destek@nahaber.com?subject=Hata%20Raporu">
          destek@nahaber.com
        </a>
        {' '}adresine cihaz modeli, iOS sürümü ve hatanın oluştuğu adım sırasını içeren bir
        e-posta gönderin. Ekran görüntüsü eklemeniz inceleme süresini kısaltır.
      </>
    ),
  },
]

interface SupportChannelProps {
  title: string
  description: string
  email: string
}

function SupportChannel({ title, description, email }: SupportChannelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">{description}</p>
      <a
        href={`mailto:${email}`}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))]/15 px-3 py-1.5 text-sm font-semibold text-[rgb(var(--color-brand))] transition-colors hover:bg-[rgb(var(--color-brand))]/25"
      >
        {email}
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
      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* ── Başlık ────────────────────────────────────────────────────── */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[rgb(var(--color-text))]">Destek ve İletişim</h1>
          <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
            Sorularınız ve geri bildirimleriniz için aşağıdaki kanallardan bize ulaşabilir veya
            sıkça sorulan sorulara göz atabilirsiniz. Tüm e-postalara hafta içi 24 saat içinde
            yanıt veriyoruz.
          </p>
        </header>

        {/* ── İletişim Formu ───────────────────────────────────────────── */}
        <section className="mb-10" aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="mb-2 text-xl font-bold text-[rgb(var(--color-text))]">
            Bize Yazın
          </h2>
          <p className="mb-4 text-sm text-[rgb(var(--color-muted))]">
            Formu doldurun; mesajınız{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[rgb(var(--color-brand))] hover:underline">
              {CONTACT_EMAIL}
            </a>
            {' '}adresine iletilir.
          </p>
          <ContactForm />
        </section>

        {/* ── İletişim Kanalları ───────────────────────────────────────── */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2">
          <SupportChannel
            title="Genel İletişim"
            description="Sorularınız, önerileriniz ve geri bildirimleriniz."
            email={CONTACT_EMAIL}
          />
          <SupportChannel
            title="Müşteri Destek"
            description="Hesap, ödeme, teknik sorun ve genel destek talepleri."
            email="destek@nahaber.com"
          />
          <SupportChannel
            title="Editöryal & Düzeltme"
            description="Haber düzeltme, bilgi yanlışlığı bildirimi, basın bülteni."
            email="haber@nahaber.com"
          />
          <SupportChannel
            title="Gizlilik & KVKK"
            description="Kişisel veri talepleri, KVKK kapsamındaki haklarınızın kullanımı."
            email="kvkk@nahaber.com"
          />
          <SupportChannel
            title="Reklam & İş Birliği"
            description="Reklam, sponsorluk, içerik ortaklığı talepleri."
            email="iletisim@nahaber.com"
          />
        </section>

        {/* ── SSS ─────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-white">Sıkça Sorulan Sorular</h2>
          <div className="space-y-3">
            {FAQ.map((entry, idx) => (
              <details
                key={idx}
                className="group rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.07]"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-white marker:hidden">
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

        {/* ── Hesap Silme ──────────────────────────────────────────────── */}
        <section className="mb-10 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <h2 className="mb-2 text-base font-bold text-white">Hesabınızı Silmek mi İstiyorsunuz?</h2>
          <p className="mb-3 text-sm text-[rgb(var(--color-muted))]">
            Uygulama içinden{' '}
            <strong className="text-white">Ayarlar → Oturum → Hesabı Sil</strong> menüsüne
            giderek hesabınızı doğrudan ve kalıcı olarak silebilirsiniz. İşlem birkaç saniye
            içinde tamamlanır.
          </p>
          <Link
            href="/settings/account/delete"
            className="mb-3 inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/30"
          >
            Hesap Silme Sayfasına Git →
          </Link>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Uygulamaya erişiminiz yoksa{' '}
            <a className="text-[rgb(var(--color-brand))] underline" href="mailto:destek@nahaber.com?subject=Hesap%20Silme%20Talebi">
              destek@nahaber.com
            </a>
            {' '}adresine yazın; talep en geç 30 gün içinde işleme alınır. Yasal saklama
            yükümlülüğü olan kayıtlar (örn. fatura, vergi mevzuatı kaynaklı veriler) ilgili
            yasal süre dolana kadar saklanır.
          </p>
        </section>

        {/* ── Sosyal Medya ─────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Sosyal Medya</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://twitter.com/nahabercom"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[rgb(var(--color-brand))] hover:bg-white/[0.08]"
            >
              Twitter / X
            </a>
            <a
              href="https://www.instagram.com/nahabercom"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[rgb(var(--color-brand))] hover:bg-white/[0.08]"
            >
              Instagram
            </a>
            <a
              href="https://www.facebook.com/nahabercom"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[rgb(var(--color-brand))] hover:bg-white/[0.08]"
            >
              Facebook
            </a>
          </div>
        </section>

        {/* ── Yasal Sayfa Linkleri ─────────────────────────────────────── */}
        <section className="border-t border-[rgb(var(--color-border))] pt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            Yasal Belgeler ve Politikalar
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-[rgb(var(--color-brand))] underline hover:no-underline">
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
