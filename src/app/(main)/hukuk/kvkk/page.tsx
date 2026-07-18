import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KVKK — Kişisel Verilerin Korunması Politikası | NaHaber',
  description: '6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca NaHaber kişisel veri işleme politikası.',
}

export default function KVKKPage() {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-[rgb(var(--color-text))]">
      <div>
        <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">
          Kişisel Verilerin Korunması Politikası
        </h1>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Son güncelleme: Haziran 2025 · Versiyon 1.0
        </p>
      </div>

      <Section title="1. Giriş ve Amaç">
        <p>
          NaHaber, Shen Medya bünyesinde yayın yapan bir haber platformudur. Bu Politika;
          6698 sayılı <b>Kişisel Verilerin Korunması Kanunu (KVKK)</b> ve Avrupa Birliği Genel
          Veri Koruma Tüzüğü <b>(GDPR)</b> kapsamında, nahaber.com ziyaretçilerinin ve üyelerinin
          kişisel verilerini nasıl topladığımızı, işlediğimizi ve koruduğumuzu açıklamaktadır.
        </p>
        <p>
          Veri sorumlusu sıfatıyla, topladığımız her verinin işlenme amacını ve hukuki dayanağını
          bu Politika ile şeffaf biçimde kamuoyuyla paylaşıyoruz.
        </p>
      </Section>

      <Section title="2. Veri Sorumlusu">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <TR label="Ünvan" value="Shen Medya" />
            <TR label="Platform" value="NaHaber (nahaber.com)" />
            <TR label="İletişim" value="bilgi@nahaber.com" />
            <TR label="Adres" value="Türkiye" />
          </tbody>
        </table>
      </Section>

      <Section title="3. Kapsam">
        <p>
          Bu Politika; nahaber.com'u ziyaret eden, içerik okuyan, üye olan veya herhangi bir
          şekilde etkileşime giren tüm gerçek kişilerin verilerini kapsar. Otomatik ya da
          otomatik olmayan yollarla elde edilen tüm kişisel veriler bu Politika çerçevesinde korunur.
        </p>
      </Section>

      <Section title="4. Topladığımız Veriler ve Amaçları">
        <p>Aşağıdaki veri kategorilerini işleyebiliriz:</p>
        <div className="mt-3 space-y-3">
          <DataRow
            label="Kimlik ve iletişim verileri"
            desc="Üye kaydı sırasında alınan ad, e-posta, kullanıcı adı. Amaç: hesap yönetimi, bildirimler."
          />
          <DataRow
            label="Teknik veriler"
            desc="IP adresi, tarayıcı bilgisi, cihaz türü, oturum süresi. Amaç: güvenlik, hizmet kalitesi, istatistik."
          />
          <DataRow
            label="Konum verisi (isteğe bağlı)"
            desc="Yerel haber sekmesinde kullanıcı izni alınarak şehir tespiti. Amaç: yerel içerik sunumu."
          />
          <DataRow
            label="Kullanım verileri"
            desc="Okunan haberler, etkileşimler. Amaç: içerik kişiselleştirme, platform iyileştirme."
          />
          <DataRow
            label="Çerez verileri"
            desc="Teknik çerezler ve oturum bilgileri. Ayrıntı için bkz. Çerez Politikamız."
          />
        </div>
        <p className="mt-3 rounded-lg bg-[rgb(var(--color-surface))] px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
          Özel nitelikli kişisel veri (sağlık, siyasi görüş, din vb.) toplanmamaktadır.
        </p>
      </Section>

      <Section title="5. İşlemenin Hukuki Dayanakları">
        <ul className="space-y-1.5 pl-4">
          <li className="list-disc">Açık rıza (KVKK Md. 5/1, GDPR Md. 6/1-a) — çerez onayı</li>
          <li className="list-disc">Sözleşmenin ifası (KVKK Md. 5/2-c) — üyelik hizmetleri</li>
          <li className="list-disc">Hukuki yükümlülük (KVKK Md. 5/2-ç) — 5651 sayılı Kanun log saklama yükümlülüğü</li>
          <li className="list-disc">Meşru menfaat (KVKK Md. 5/2-f) — site güvenliği, dolandırıcılık önleme</li>
        </ul>
      </Section>

      <Section title="6. Verilerin Aktarılması">
        <p>
          Kişisel verileriniz; Firestore/Firebase (Google LLC) altyapısı, Vercel Inc. (hosting),
          Google Analytics (istatistik) gibi hizmet sağlayıcılara KVKK Md. 8–9 ve GDPR Bölüm V
          kapsamında aktarılabilir. Tüm üçüncü taraflar yeterli güvenlik tedbirlerini almış
          ve gerekli sözleşmelerle bağlı olanlardır.
        </p>
      </Section>

      <Section title="7. Saklama Süreleri">
        <p>
          Veriler, işleme amacının gerektirdiği en kısa süre boyunca saklanır.
          Üyelik verileri hesap silinmesinden itibaren 30 gün; log kayıtları 2 yıl;
          muhasebe belgeleri ise yasal süre (10 yıl) boyunca muhafaza edilir.
          Süre dolunca veriler silinir, yok edilir veya anonim hale getirilir.
        </p>
      </Section>

      <Section title="8. Güvenlik Tedbirleri">
        <p>
          Verilerinizi korumak için SSL/TLS şifreleme, güvenlik duvarları, erişim kısıtlama,
          düzenli güvenlik denetimleri ve veri minimizasyonu ilkesi uygulanmaktadır.
          Veri ihlali tespitinde KVKK Md. 12/5 uyarınca 72 saat içinde Kurul'a ve ilgili kişilere
          bildirim yapılır.
        </p>
      </Section>

      <Section title="9. Haklarınız">
        <p>KVKK Md. 11 ve GDPR Md. 15–22 uyarınca aşağıdaki haklara sahipsiniz:</p>
        <ul className="mt-2 space-y-1.5 pl-4">
          {[
            'Kişisel veri işlenip işlenmediğini öğrenme',
            'İşleniyorsa buna ilişkin bilgi talep etme',
            'İşlenme amacını ve amaca uygunluğunu öğrenme',
            'Yurt içi veya yurt dışında aktarılan üçüncü kişileri bilme',
            'Eksik veya yanlış verilerin düzeltilmesini isteme',
            'Koşulların ortadan kalkması halinde silinmesini / yok edilmesini isteme',
            'İşlemeye itiraz etme (otomatik kararlar dahil)',
            'Kanuna aykırı işleme nedeniyle zararın tazminini talep etme',
          ].map((h) => (
            <li key={h} className="list-disc">{h}</li>
          ))}
        </ul>
        <p className="mt-3">
          Başvurularınızı{' '}
          <a href="mailto:bilgi@nahaber.com" className="font-semibold text-[rgb(var(--color-brand))] hover:underline">
            bilgi@nahaber.com
          </a>{' '}
          adresine e-posta ile iletebilirsiniz. Talebiniz 30 gün içinde ücretsiz yanıtlanır.
          Yanıt yetersiz bulunursa <b>Kişisel Verileri Koruma Kurulu</b>'na şikâyette bulunabilirsiniz.
        </p>
      </Section>

      <Section title="10. Politika Güncellemeleri">
        <p>
          Bu Politika gerektiğinde güncellenir. Önemli değişiklikler sitemizde duyurulur.
          Güncel sürüm daima nahaber.com/hukuk/kvkk adresinde yayımlanır.
        </p>
      </Section>

      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-xs text-[rgb(var(--color-muted))]">
        Sorularınız için:{' '}
        <a href="mailto:bilgi@nahaber.com" className="text-[rgb(var(--color-brand))] hover:underline">
          bilgi@nahaber.com
        </a>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-[rgb(var(--color-text))]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function TR({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[rgb(var(--color-border))]">
      <td className="w-32 py-2 pr-4 font-semibold text-[rgb(var(--color-muted))]">{label}</td>
      <td className="py-2">{value}</td>
    </tr>
  )
}

function DataRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">{label}</p>
      <p className="mt-0.5 text-sm text-[rgb(var(--color-text))]">{desc}</p>
    </div>
  )
}
