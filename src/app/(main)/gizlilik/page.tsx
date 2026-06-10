import type { Metadata } from 'next'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl  = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://nahaber.com'

export const metadata: Metadata = {
  title: `Gizlilik Politikası | ${siteName}`,
  description: `${siteName} gizlilik politikası. Kişisel verilerinizin nasıl toplandığı, işlendiği ve korunduğu hakkında bilgi edinin.`,
  alternates: { canonical: `${siteUrl}/gizlilik` },
  robots: { index: true, follow: true },
}

export default function GizlilikPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Gizlilik Politikası</h1>
      <p className="mb-8 text-sm text-[rgb(var(--color-muted))]">Son güncelleme: Haziran 2025</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[rgb(var(--color-muted))]">
        <h2 className="text-xl font-semibold text-white">1. Toplanan Veriler</h2>
        <p>
          {siteName} olarak site kullanımınızı analiz etmek amacıyla anonim kullanım
          verileri (sayfa görüntülemeleri, tıklamalar) topluyoruz. Üyelik oluşturmanız
          durumunda e-posta adresiniz ve kullanıcı adınız işlenmektedir.
        </p>

        <h2 className="text-xl font-semibold text-white">2. Verilerin Kullanımı</h2>
        <p>
          Toplanan veriler yalnızca hizmetin iyileştirilmesi, kişiselleştirilmiş içerik
          sunulması ve teknik sorunların çözümü amacıyla kullanılmaktadır. Verileriniz
          herhangi bir üçüncü tarafa satılmamaktadır.
        </p>

        <h2 className="text-xl font-semibold text-white">3. Çerezler</h2>
        <p>
          Sitemizde oturum yönetimi ve analitik amaçlı çerezler kullanılmaktadır.
          Tarayıcı ayarlarınızdan çerezleri devre dışı bırakabilirsiniz; ancak bu
          durumda bazı özellikler çalışmayabilir.
        </p>

        <h2 className="text-xl font-semibold text-white">4. KVKK Hakları</h2>
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında verilerinize erişim,
          düzeltme ve silme haklarına sahipsiniz. Talepleriniz için{' '}
          <a href="mailto:kvkk@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
            kvkk@nahaber.com
          </a>{' '}
          adresine yazabilirsiniz.
        </p>

        <h2 className="text-xl font-semibold text-white">5. İletişim</h2>
        <p>
          Gizlilik politikamızla ilgili sorularınız için{' '}
          <a href="/iletisim" className="text-[rgb(var(--color-brand))] underline">
            iletişim sayfamızı
          </a>{' '}
          ziyaret edebilirsiniz.
        </p>
      </div>
    </main>
  )
}
