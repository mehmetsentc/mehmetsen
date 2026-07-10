import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası | NaHaber',
  description: 'NaHaber gizlilik politikası — verilerinizi nasıl toplar, kullanır ve koruduğumuzu öğrenin.',
}

export default function GizlilikPage() {
  return (
    <div className="legal-content prose prose-sm max-w-none text-[rgb(var(--color-text))]">
      <h1 className="text-2xl font-black text-[rgb(var(--color-text))] mb-1">Gizlilik Politikası</h1>
      <p className="text-xs text-[rgb(var(--color-muted))] mb-8">Son güncelleme: Haziran 2025</p>

      <Section title="1. Genel Bakış">
        <p>
          Bu Gizlilik Politikası, NaHaber platformunun (nahaber.com) kullanıcı gizliliğini
          nasıl ele aldığını açıklar. NaHaber, Shen Medya bünyesinde faaliyet göstermektedir.
          Gizliliğinize saygı duyuyor; verilerinizi yalnızca size daha iyi haber deneyimi
          sunmak için kullanıyoruz.
        </p>
      </Section>

      <Section title="2. Topladığımız Bilgiler">
        <p><strong>a) Siz bize verirsiniz:</strong></p>
        <ul>
          <li>Üye kaydı: ad, e-posta adresi, kullanıcı adı</li>
          <li>Profil güncellemeleri: biyografi, profil fotoğrafı (isteğe bağlı)</li>
          <li>Bize ilettiğiniz mesajlar: destek talepleri, geri bildirimler</li>
        </ul>
        <p><strong>b) Otomatik toplanan veriler:</strong></p>
        <ul>
          <li>Bağlantı bilgileri: IP adresi, tarayıcı türü ve versiyonu, işletim sistemi</li>
          <li>Kullanım verileri: okunan haberler, harcanan süre, tıklama etkileşimleri</li>
          <li>Cihaz bilgisi: ekran çözünürlüğü, platform (iOS/Android/web)</li>
        </ul>
        <p><strong>c) İzninizle toplanan veriler:</strong></p>
        <ul>
          <li>Konum (şehir düzeyi): yalnızca yerel haber özelliği için, istediğiniz zaman iptal edilebilir</li>
          <li>Bildirim izni: tarayıcı veya mobil bildirimler için</li>
        </ul>
      </Section>

      <Section title="3. Verileri Nasıl Kullanırız">
        <ul>
          <li>Hesabınızı yönetmek ve hizmet sunmak</li>
          <li>İçerik kişiselleştirme ve yerel haber eşleştirme</li>
          <li>Platform güvenliğini sağlamak ve kötüye kullanımı önlemek</li>
          <li>Hizmet kalitesini geliştirmek için anonim istatistik üretmek</li>
          <li>Yasal yükümlülükleri yerine getirmek</li>
          <li>Önemli hizmet bildirimleri göndermek (isteğe bağlı pazarlama bildirimleri ayrıca onay gerektirir)</li>
        </ul>
      </Section>

      <Section title="4. Verilerinizi Kimlerle Paylaşırız">
        <p>
          Kişisel verilerinizi üçüncü taraflara satmıyoruz. Aşağıdaki durumlar dışında
          kimseyle paylaşmıyoruz:
        </p>
        <ul>
          <li><strong>Hizmet sağlayıcılar:</strong> Firebase/Google (altyapı), Vercel (hosting) — yalnızca hizmet sunumu için</li>
          <li><strong>Yasal zorunluluk:</strong> Mahkeme kararı veya yetkili makam talebi</li>
          <li><strong>Güvenlik:</strong> Sahtekârlık veya saldırı tespiti durumunda ilgili birimler</li>
        </ul>
      </Section>

      <Section title="5. Verilerinizin Güvenliği">
        <p>
          Verilerinizi korumak için sektör standardı önlemler uygulanmaktadır:
          HTTPS/TLS şifreleme, rol tabanlı erişim kontrolü, şifreli veritabanı depolama,
          düzenli güvenlik güncellemeleri ve güvenlik açığı taramaları.
        </p>
      </Section>

      <Section title="6. Çerezler ve İzleme">
        <p>
          Çerez uygulamalarımız için ayrı{' '}
          <Link href="/hukuk/cerez-politikasi" className="text-[rgb(var(--color-brand))] hover:underline">
            Çerez Politikamızı
          </Link>{' '}
          inceleyebilirsiniz. Analitik çerezler için Google Analytics kullanılmaktadır;
          bu verileri anonimleştirilmiş biçimde işliyoruz.
        </p>
      </Section>

      <Section title="7. Çocukların Gizliliği">
        <p>
          NaHaber hizmetleri 13 yaşın altındaki kişilere yönelik değildir ve bu kişilerden
          bilinçli olarak veri toplamıyoruz. 13 yaş altı bir çocuğun verilerini topladığımızı
          fark ederseniz lütfen iletisim@nahaber.com adresinden bize bildirin; ilgili verileri
          derhal sileriz.
        </p>
      </Section>

      <Section title="8. Haklarınız">
        <p>
          Kişisel verilerinize ilişkin haklarınızın ayrıntısı için{' '}
          <Link href="/hukuk/kvkk" className="text-[rgb(var(--color-brand))] hover:underline">
            KVKK Politikamızı
          </Link>{' '}
          inceleyiniz. Talep ve sorularınız için{' '}
          <a href="mailto:iletisim@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline">
            iletisim@nahaber.com
          </a>{' '}
          adresine yazabilirsiniz.
        </p>
      </Section>

      <Section title="9. Politika Değişiklikleri">
        <p>
          Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikler sitemizde
          duyurulacak; güncel versiyon daima bu sayfada yayımlanacaktır.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-bold text-[rgb(var(--color-text))]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[rgb(var(--color-text))]">
        {children}
      </div>
    </section>
  )
}
