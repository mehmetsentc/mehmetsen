import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Gizlilik Politikası',
  description: `${siteName} gizlilik politikası. Kişisel verilerinizin nasıl toplandığı, işlendiği ve korunduğu hakkında bilgi edinin.`,
  alternates: { canonical: `${siteUrl}/gizlilik` },
  robots: { index: true, follow: true },
}

export default function GizlilikPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Gizlilik Politikası</h1>
      <p className="mb-8 text-sm text-[rgb(var(--color-muted))]">Son güncelleme: Temmuz 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-[rgb(var(--color-muted))]">
        <h2 className="text-xl font-semibold text-white">1. Toplanan Veriler</h2>
        <p>
          Analitik izni vermeniz halinde sayfa görüntülemeleri, oturum ve anonim ziyaretçi
          kimlikleri, yönlendiren site ve kampanya bilgileri, yaklaşık ülke/şehir, tarayıcı
          dili, saat dilimi, cihaz, işletim sistemi, tarayıcı, sayfada kalma ve kaydırma
          oranı işlenebilir. Ham IP adresi saklanmaz; güvenlik ve tekilleştirme amacıyla
          maskelenmiş ve geri döndürülemez özetlenmiş biçimi kullanılır. Üyelik
          oluşturmanız durumunda e-posta adresiniz ve kullanıcı adınız da işlenmektedir.
        </p>

        <h2 className="text-xl font-semibold text-white">2. Verilerin Kullanımı</h2>
        <p>
          Toplanan veriler yalnızca hizmetin iyileştirilmesi, kişiselleştirilmiş içerik
          sunulması ve teknik sorunların çözümü amacıyla kullanılmaktadır. Verileriniz
          herhangi bir üçüncü tarafa satılmamaktadır.
        </p>

        <h2 className="text-xl font-semibold text-white">3. Çerezler</h2>
        <p>
          Zorunlu depolama oturum yönetimi için kullanılır. Analitik amaçlı ziyaretçi ve
          oturum tanımlayıcıları yalnızca açık analitik izninizden sonra oluşturulur.
          Tercihinizi çerez ayarlarından dilediğiniz zaman değiştirebilirsiniz. Ayrıntılı
          analitik olayları en fazla 90 gün tutulur ve günlük otomatik temizleme ile silinir.
        </p>

        <h2 className="text-xl font-semibold text-white">4. Reklam ve Üçüncü Taraf Teknolojileri</h2>
        <p>
          {siteName}, reklamları sunmak amacıyla <strong className="text-white">Google AdSense</strong> hizmetini
          kullanmaktadır. Google, <strong className="text-white">DoubleClick DART çerezi</strong> dahil olmak üzere
          çeşitli çerezler aracılığıyla sitenize ve internet genelindeki önceki ziyaretlerinize
          dayalı reklamlar gösterebilir.
        </p>
        <p>
          Üçüncü taraf reklam sunucuları veya reklam ağları, {siteName}&apos;de yayınlanan reklamlarda
          ve bağlantılarda doğrudan tarayıcınıza gönderilen çerezler, JavaScript veya web işaretçileri
          (web beacon) kullanabilir. Bu durumda IP adresiniz otomatik olarak ilgili servise iletilir.
          Bu teknolojiler ilgili reklam kampanyalarının etkinliğini ölçmek ve/veya ziyaret ettiğiniz
          web sitelerinde gördüğünüz reklam içeriklerini kişiselleştirmek amacıyla kullanılmaktadır.
        </p>
        <p>
          {siteName}&apos;nin, üçüncü taraf reklam sunucularının kullandığı bu çerezler üzerinde herhangi
          bir erişimi veya denetimi bulunmamaktadır.
        </p>
        <p>
          Kişiselleştirilmiş reklamları devre dışı bırakmak için aşağıdaki bağlantıları kullanabilirsiniz:
        </p>
        <ul>
          <li>
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer"
              className="text-[rgb(var(--color-brand))] underline">
              Google Reklam Ayarları
            </a>
          </li>
          <li>
            <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer"
              className="text-[rgb(var(--color-brand))] underline">
              Network Advertising Initiative (NAI) çıkış sayfası
            </a>
          </li>
          <li>
            <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer"
              className="text-[rgb(var(--color-brand))] underline">
              Digital Advertising Alliance (DAA) çıkış sayfası
            </a>
          </li>
        </ul>
        <p>
          Google&apos;ın gizlilik politikası hakkında daha fazla bilgi için{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
            className="text-[rgb(var(--color-brand))] underline">
            Google Gizlilik Politikası
          </a>&apos;nı inceleyebilirsiniz.
        </p>

        <h2 className="text-xl font-semibold text-white">5. KVKK Hakları</h2>
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında verilerinize erişim,
          düzeltme ve silme haklarına sahipsiniz. Talepleriniz için{' '}
          <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] underline">
            bilgi@nahaber.com
          </a>{' '}
          adresine yazabilirsiniz.
        </p>

        <h2 className="text-xl font-semibold text-white">6. Üçüncü Taraf Gizlilik Politikaları</h2>
        <p>
          {siteName}&apos;nin gizlilik politikası yalnızca bu siteye uygulanmaktadır.
          Üçüncü taraf reklam ortakları, analiz sağlayıcıları veya bağlantılı siteler için
          ayrı gizlilik politikaları geçerlidir. Bu üçüncü tarafların uygulamalarından
          {siteName} sorumlu tutulamaz. Başlıca üçüncü taraf hizmetlerimiz:
        </p>
        <ul>
          <li>
            <strong className="text-white">Google AdSense / Google LLC</strong> —{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
              className="text-[rgb(var(--color-brand))] underline">gizlilik politikası</a>
          </li>
          <li>
            <strong className="text-white">Google Analytics / Google LLC</strong> —{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
              className="text-[rgb(var(--color-brand))] underline">gizlilik politikası</a>
          </li>
          <li>
            <strong className="text-white">Firebase / Google LLC</strong> — kimlik doğrulama ve veritabanı
          </li>
          <li>
            <strong className="text-white">Vercel Inc.</strong> — hosting ve performans izleme
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-white">7. İletişim</h2>
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
