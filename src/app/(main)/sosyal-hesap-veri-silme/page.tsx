import type { Metadata } from 'next'
import { NewspaperEditorialPage } from '@/components/home/desktop/NewspaperEditorialPage'
import { getSiteUrl } from '@/lib/seo'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Sosyal Hesap Bağlantısı ve Veri Silme',
  description: 'NaHaber’e bağlanan Instagram, Facebook ve Threads hesaplarının bağlantısını kaldırma ve platform verilerinin silinmesi.',
  alternates: { canonical: `${siteUrl}/sosyal-hesap-veri-silme` },
  robots: { index: true, follow: true },
}

export default function SosyalHesapVeriSilmePage() {
  return (
    <NewspaperEditorialPage title="Sosyal hesap bağlantısı ve veri silme" kicker="Yasal" updated="Son güncelleme: Ekim 2026">
      <div className="space-y-6">
        <h2>NaHaber hangi verileri saklar?</h2>
        <p>
          Instagram, Facebook (Sayfa) veya Threads hesabınızı NaHaber’e bağladığınızda giriş ve izin onayı
          platformun kendi ekranında yapılır; NaHaber şifrenizi görmez ve saklamaz. Bağlantı için şu bilgiler
          saklanır: platformdaki hesap/sayfa kimliği, görünen ad ve kullanıcı adı, verdiğiniz izinlerin listesi,
          erişim anahtarının geçerlilik süresi ve şifrelenmiş erişim anahtarı. Erişim anahtarı yalnız sunucuda
          şifreli tutulur, hiçbir ekranda gösterilmez.
        </p>
        <p>
          Bu bilgiler yalnız sizin seçtiğiniz haberleri, sizin onayınızla ya da sizin açtığınız otomatik paylaşım
          kurallarına göre bu hesapta yayımlamak ve bağlantının sağlığını kontrol etmek için kullanılır. Yapılan
          her paylaşım için haber, hesap, biçim, sonuç ve platformun verdiği gönderi kimliği kaydedilir; bu kayıt
          aynı haberin ikinci kez gönderilmesini önler.
        </p>

        <h2>Bağlantıyı NaHaber’den kaldırma</h2>
        <ol>
          <li>NaHaber’de oturum açın.</li>
          <li>
            Kişisel ve yayıncı hesapları için <a href="/settings/social" className="text-[rgb(var(--color-brand))] underline">Ayarlar → Sosyal hesaplarım</a>,
            kurumsal (merkez/il) hesaplar için yönetim panelinde <strong>Sosyal Medya → Hesaplar</strong> sayfasını açın.
          </li>
          <li>İlgili hesabın kartında <strong>«Bağlantıyı kaldır»</strong> düğmesine basın ve onaylayın.</li>
        </ol>
        <p>
          Bağlantı kaldırıldığında şifrelenmiş erişim anahtarı silinir; görünen ad, kullanıcı adı, izin listesi ve
          geçerlilik bilgisi temizlenir; bu hesaba bağlı otomatik paylaşım kuralları kapatılır ve bekleyen
          paylaşımlar iptal edilir. Daha önce yapılmış paylaşımların kaydı (haber, platform gönderi kimliği, tarih)
          ve denetim kayıtları, mükerrer yayını önlemek ve yasal yükümlülükler için saklanır.
        </p>

        <h2>Platform tarafında erişimi kaldırma</h2>
        <ul>
          <li>Instagram: Ayarlar → Uygulamalar ve web siteleri → NaHaber → Kaldır.</li>
          <li>Facebook: Ayarlar ve gizlilik → Ayarlar → İşletme entegrasyonları (veya Uygulamalar ve web siteleri) → NaHaber → Kaldır.</li>
          <li>Threads: Ayarlar → Hesap → Web sitesi izinleri → NaHaber → Kaldır.</li>
        </ul>
        <p>Platformda erişimi kaldırdığınızda NaHaber bu hesapla artık yayın yapamaz; panel hesabı «yeniden bağlantı gerekli» olarak gösterir.</p>

        <h2>Tüm verilerin silinmesini talep etme</h2>
        <p>
          Paylaşım kayıtları dahil hesabınızla ilgili verilerin silinmesini istiyorsanız{' '}
          <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] underline">bilgi@nahaber.com</a> adresine,
          bağlı hesabın platformunu ve kullanıcı adını belirterek yazın. 6698 sayılı KVKK kapsamındaki haklarınız
          saklıdır.
        </p>
      </div>
    </NewspaperEditorialPage>
  )
}
