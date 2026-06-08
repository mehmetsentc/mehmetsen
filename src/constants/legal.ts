import { APP_CONFIG } from '@/constants/config'

export const LEGAL_LAST_UPDATED = '6 Haziran 2025'

export interface LegalSection {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export interface LegalDocument {
  title: string
  subtitle: string
  lastUpdated: string
  sections: LegalSection[]
}

export const TERMS_OF_USE: LegalDocument = {
  title: 'Kullanım Koşulları',
  subtitle: `${APP_CONFIG.NAME} platformunu kullanmadan önce lütfen bu koşulları okuyun.`,
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: 'acceptance',
      title: '1. Koşulların kabulü',
      paragraphs: [
        `${APP_CONFIG.NAME} ("Platform"), kullanıcıların haber, görüş ve medya içeriklerini paylaşmasına, takip etmesine ve etkileşimde bulunmasına olanak tanıyan bir sosyal haber platformudur.`,
        'Platforma kayıt olarak, bu Kullanım Koşulları\'nı ("Koşullar") okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş olursunuz. Koşulları kabul etmiyorsanız Platformu kullanmamalısınız.',
      ],
    },
    {
      id: 'eligibility',
      title: '2. Uygunluk ve hesap',
      paragraphs: [
        'Platformu kullanmak için en az 13 yaşında olmanız gerekir. 18 yaşından küçükseniz, ebeveyn veya yasal vasinizin bu Koşulları kabul etmiş olması gerekir.',
        'Hesap oluştururken doğru, güncel ve eksiksiz bilgi vermeyi; hesap bilgilerinizin gizliliğini korumayı ve hesabınız üzerinden gerçekleşen tüm faaliyetlerden sorumlu olmayı kabul edersiniz.',
        'Bir kişi yalnızca bir hesap açabilir. Sahte, yanıltıcı veya başkası adına açılan hesaplar askıya alınabilir veya kalıcı olarak kapatılabilir.',
      ],
    },
    {
      id: 'content',
      title: '3. Kullanıcı içerikleri',
      paragraphs: [
        'Platformda paylaştığınız metin, fotoğraf, video, yorum ve diğer materyaller ("Kullanıcı İçeriği") size aittir. İçeriği paylaşarak, Platformun bu içeriği barındırmasına, görüntülemesine, dağıtmasına ve tanıtmasına yönelik sınırlı, devredilebilir, alt lisanslanabilir ve dünya çapında geçerli bir lisans vermiş olursunuz.',
        'Kullanıcı İçeriğinden yalnızca siz sorumlusunuz. Paylaştığınız içeriğin üçüncü kişilerin haklarını (telif, marka, gizlilik vb.) ihlal etmediğini garanti edersiniz.',
      ],
    },
    {
      id: 'prohibited',
      title: '4. Yasaklanan davranışlar',
      paragraphs: ['Platformu kullanırken aşağıdaki davranışlarda bulunamazsınız:'],
      bullets: [
        'Yasa dışı, tehditkar, nefret söylemi içeren, taciz edici, müstehcen veya yanıltıcı içerik paylaşmak',
        'Başkalarının kişisel verilerini izinsiz yayınlamak (doxxing)',
        'Spam, sahte haber veya kasıtlı olarak yanıltıcı bilgi yaymak',
        'Telif hakkı veya fikri mülkiyet haklarını ihlal etmek',
        'Platformun güvenliğini tehlikeye atmak, otomatik bot veya kazıma araçları kullanmak',
        'Başka kullanıcıları taklit etmek veya kimliğe bürünmek',
        'Platformun normal işleyişini bozacak teknik müdahalelerde bulunmak',
      ],
    },
    {
      id: 'moderation',
      title: '5. Moderasyon ve hesap sonlandırma',
      paragraphs: [
        'Platform, Koşulları ihlal eden içerikleri önceden bildirmeksizin kaldırma, hesapları geçici veya kalıcı olarak askıya alma hakkını saklı tutar.',
        'İçerik moderasyonu otomatik sistemler ve insan incelemesi yoluyla yapılabilir. Moderasyon kararlarına itiraz için destek@nahaber.app adresine başvurabilirsiniz.',
        'Hesabınızı dilediğiniz zaman Ayarlar bölümünden kapatabilirsiniz. Hesap kapatıldığında profil bilgileriniz silinir; yasal yükümlülüklerimiz kapsamında bazı veriler sınırlı süre saklanabilir.',
      ],
    },
    {
      id: 'intellectual',
      title: '6. Fikri mülkiyet',
      paragraphs: [
        `${APP_CONFIG.NAME} adı, logosu, arayüz tasarımı ve Platform yazılımı dahil olmak üzere Platforma ait tüm fikri mülkiyet hakları bize veya lisans verenlerimize aittir.`,
        'Koşullar size Platformu kişisel ve ticari olmayan amaçlarla kullanma hakkı verir; kaynak kodunu kopyalama, tersine mühendislik yapma veya Platformu yeniden satma hakkı vermez.',
      ],
    },
    {
      id: 'disclaimer',
      title: '7. Sorumluluk reddi',
      paragraphs: [
        'Platform "olduğu gibi" sunulmaktadır. Kullanıcılar tarafından paylaşılan içeriklerin doğruluğu, güncelliği veya güvenilirliği konusunda garanti vermiyoruz.',
        'Platformdaki haber ve görüşler yalnızca paylaşan kullanıcıların sorumluluğundadır; profesyonel hukuk, tıbbi veya finansal tavsiye niteliği taşımaz.',
        'Yasaların izin verdiği azami ölçüde, Platform kullanımından doğan dolaylı, arızi veya sonuç olarak ortaya çıkan zararlardan sorumlu tutulamayız.',
      ],
    },
    {
      id: 'changes',
      title: '8. Koşullarda değişiklik',
      paragraphs: [
        'Bu Koşulları zaman zaman güncelleyebiliriz. Önemli değişiklikler Platform üzerinden veya kayıtlı e-posta adresinize bildirilecektir.',
        'Değişiklikler yayımlandıktan sonra Platformu kullanmaya devam etmeniz, güncellenmiş Koşulları kabul ettiğiniz anlamına gelir.',
      ],
    },
    {
      id: 'law',
      title: '9. Uygulanacak hukuk ve iletişim',
      paragraphs: [
        'Bu Koşullar Türkiye Cumhuriyeti kanunlarına tabidir. Uyuşmazlıklarda İstanbul (Merkez) mahkeme ve icra daireleri yetkilidir.',
        'Sorularınız için destek@nahaber.app adresine yazabilirsiniz.',
      ],
    },
  ],
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Gizlilik Politikası',
  subtitle: `${APP_CONFIG.NAME} olarak kişisel verilerinizi nasıl topladığımızı, kullandığımızı ve koruduğumuzu açıklıyoruz.`,
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: 'controller',
      title: '1. Veri sorumlusu',
      paragraphs: [
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu ${APP_CONFIG.NAME} platformudur.`,
        'Gizlilik ile ilgili sorularınız için destek@nahaber.app adresine başvurabilirsiniz.',
      ],
    },
    {
      id: 'collected',
      title: '2. Toplanan veriler',
      paragraphs: ['Platformu kullanırken aşağıdaki kişisel veriler toplanabilir:'],
      bullets: [
        'Kimlik ve iletişim: ad, kullanıcı adı, e-posta adresi, profil fotoğrafı',
        'Hesap bilgileri: şifre (şifrelenmiş olarak saklanır), kayıt tarihi, oturum bilgileri',
        'İçerik verileri: paylaştığınız haberler, fotoğraflar, videolar, yorumlar ve beğeniler',
        'Konum verisi: yalnızca siz açıkça izin verdiğinizde ve paylaşım sırasında seçtiğinizde',
        'Kullanım verileri: cihaz türü, tarayıcı, IP adresi, oturum süresi ve etkileşim istatistikleri',
        'Tercihler: tema, dil, bildirim ve gizlilik ayarları (cihazınızda yerel olarak da saklanabilir)',
      ],
    },
    {
      id: 'purpose',
      title: '3. Verilerin kullanım amaçları',
      paragraphs: ['Kişisel verileriniz aşağıdaki amaçlarla işlenir:'],
      bullets: [
        'Hesap oluşturma, kimlik doğrulama ve oturum yönetimi',
        'İçerik paylaşımı, akış gösterimi ve sosyal etkileşim özelliklerinin sunulması',
        'Platform güvenliğinin sağlanması, kötüye kullanımın önlenmesi ve moderasyon',
        'Bildirimlerin iletilmesi (tercihlerinize göre)',
        'Hizmet kalitesinin iyileştirilmesi ve hata analizi',
        'Yasal yükümlülüklerin yerine getirilmesi',
      ],
    },
    {
      id: 'legal-basis',
      title: '4. Hukuki dayanak',
      paragraphs: [
        'Verileriniz KVKK madde 5 kapsamında; sözleşmenin kurulması ve ifası, hukuki yükümlülük, meşru menfaat ve açık rızanız (konum paylaşımı gibi isteğe bağlı özellikler için) hukuki dayanaklarıyla işlenir.',
      ],
    },
    {
      id: 'sharing',
      title: '5. Verilerin paylaşımı',
      paragraphs: [
        'Kişisel verilerinizi üçüncü taraflara satmıyoruz. Veriler yalnızca aşağıdaki durumlarda paylaşılabilir:',
        'Firebase hizmetleri Google\'ın gizlilik politikasına tabidir. Veriler Avrupa veya Türkiye\'ye yakın bölgelerde barındırılabilir.',
      ],
      bullets: [
        'Hizmet sağlayıcılar: Firebase (Google) — kimlik doğrulama, veritabanı, dosya depolama ve analitik altyapısı',
        'Yasal zorunluluk: mahkeme kararı veya yetkili makam talebi halinde',
        'Güvenlik: dolandırıcılık veya kötüye kullanımın önlenmesi amacıyla sınırlı ölçüde',
      ],
    },
    {
      id: 'storage',
      title: '6. Saklama süresi',
      paragraphs: [
        'Hesabınız aktif olduğu sürece verileriniz saklanır. Hesabınızı kapattığınızda profil ve içerik verileriniz makul süre içinde silinir.',
        'Yasal yükümlülükler, uyuşmazlık çözümü veya güvenlik amaçlarıyla belirli veriler daha uzun süre arşivlenebilir.',
      ],
    },
    {
      id: 'rights',
      title: '7. Haklarınız (KVKK madde 11)',
      paragraphs: [
        'KVKK kapsamında aşağıdaki haklara sahipsiniz:',
        'Haklarınızı kullanmak için destek@nahaber.app adresine kimliğinizi doğrulayıcı bilgilerle birlikte başvurabilirsiniz. Talebiniz en geç 30 gün içinde yanıtlanır.',
      ],
      bullets: [
        'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
        'İşlenmişse buna ilişkin bilgi talep etme',
        'Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme',
        'Verilerin silinmesini veya yok edilmesini talep etme',
        'İşlemenin sınırlandırılmasını isteme',
        'Verilerin aktarıldığı üçüncü kişileri bilme',
        'Otomatik sistemlerle analiz sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
        'Kanuna aykırı işleme nedeniyle zarara uğramanız halinde tazminat talep etme',
      ],
    },
    {
      id: 'cookies',
      title: '8. Çerezler ve yerel depolama',
      paragraphs: [
        'Platform, oturum yönetimi ve tercihlerinizi hatırlamak için tarayıcı çerezleri ve yerel depolama (localStorage) kullanır.',
        'Tema, dil ve gizlilik tercihleri cihazınızda saklanır; hesap oturumu Firebase Authentication çerezleri aracılığıyla yönetilir.',
        'Tarayıcı ayarlarınızdan çerezleri devre dışı bırakabilirsiniz; bu durumda bazı özellikler düzgün çalışmayabilir.',
      ],
    },
    {
      id: 'security',
      title: '9. Güvenlik',
      paragraphs: [
        'Verilerinizi korumak için şifreleme, erişim kontrolü ve güvenli sunucu altyapısı kullanıyoruz. Hiçbir iletim veya depolama yöntemi %100 güvenli değildir; makul önlemleri almaya devam ediyoruz.',
        'Şifrenizi kimseyle paylaşmayın ve güçlü bir şifre kullanın. Hesabınızda şüpheli bir faaliyet fark ederseniz derhal bize bildirin.',
      ],
    },
    {
      id: 'children',
      title: '10. Çocukların gizliliği',
      paragraphs: [
        'Platform 13 yaş altı çocuklara yönelik değildir. Bilerek 13 yaş altından kişisel veri toplamıyoruz. Böyle bir durum fark edilirse ilgili veriler silinir.',
      ],
    },
    {
      id: 'changes',
      title: '11. Politika değişiklikleri',
      paragraphs: [
        'Bu Gizlilik Politikasını güncelleyebiliriz. Önemli değişiklikler Platform üzerinden duyurulur. Güncelleme tarihi sayfanın üst kısmında belirtilir.',
      ],
    },
    {
      id: 'contact',
      title: '12. İletişim',
      paragraphs: [
        'Gizlilik ve kişisel verilerinizle ilgili tüm sorularınız için: destek@nahaber.app',
      ],
    },
  ],
}

export interface ConsentCategoryCopy {
  id: 'necessary' | 'analytics' | 'marketing' | 'sale'
  title: string
  description: string
}

export const CONSENT_COPY = {
  title: 'Gizliliğinize değer veriyoruz',
  // Short banner explanation (GDPR opt-in + CCPA do-not-sell in one place).
  description:
    'Oturumunuzu açık tutmak ve temel işlevleri sağlamak için zorunlu çerezler kullanırız. İzin verirseniz ek olarak analitik ve kişiselleştirme/pazarlama çerezleri de kullanabiliriz. Tercihinizi istediğiniz zaman değiştirebilirsiniz.',
  manageDescription:
    'Her bir çerez kategorisini ayrı ayrı yönetin. Zorunlu çerezler platformun çalışması için gereklidir ve kapatılamaz.',
  acceptAll: 'Kabul Et',
  rejectAll: 'Reddet',
  managePreferences: 'Tercihleri Yönet',
  save: 'Tercihleri Kaydet',
  privacyPolicyLink: 'Gizlilik Politikasını oku',
  // CCPA-specific notice shown alongside the "Do Not Sell" toggle.
  ccpaTitle: 'Kaliforniya sakinleri için (CCPA)',
  ccpaDescription:
    'Kaliforniya Tüketici Gizlilik Yasası (CCPA) kapsamında, kişisel bilgilerinizin satılmasını veya paylaşılmasını reddetme hakkına sahipsiniz.',
  doNotSellLabel: 'Kişisel verilerimi satma veya paylaşma',
  doNotSellDescription:
    'Açtığınızda, kişisel verileriniz reklam veya analiz amacıyla üçüncü taraflarla paylaşılmaz/satılmaz.',
} as const

export const CONSENT_CATEGORIES: ConsentCategoryCopy[] = [
  {
    id: 'necessary',
    title: 'Zorunlu çerezler',
    description:
      'Oturum açma, güvenlik ve temel platform işlevleri için gereklidir. Her zaman etkindir ve kapatılamaz.',
  },
  {
    id: 'analytics',
    title: 'Analitik çerezler',
    description:
      'Platformu nasıl kullandığınızı anlamamıza ve performansı iyileştirmemize yardımcı olur. Veriler toplu ve anonim olarak işlenir.',
  },
  {
    id: 'marketing',
    title: 'Pazarlama ve kişiselleştirme',
    description:
      'İlgi alanlarınıza göre içerik ve önerileri kişiselleştirmek için kullanılır. Bu kategori varsayılan olarak kapalıdır.',
  },
]

export const FEED_CONTENT_POLICY: LegalDocument = {
  title: 'İçerik Kuralları ve Yasaklı Kullanımlar',
  subtitle:
    'NaHaber akışını kullanırken yasalara ve topluluk kurallarına uymanız zorunludur. Aşağıdaki içerik ve davranışlar kesinlikle yasaktır.',
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: 'scope',
      title: '1. Kapsam',
      paragraphs: [
        'Bu kurallar NaHaber haber akışı, kullanıcı paylaşımları, yorumlar, videolar ve mesajlaşma dahil tüm Platform alanları için geçerlidir.',
        'Kayıt olmadan akışı görüntüleyen ziyaretçiler de bu kurallara tabidir. Kuralları ihlal eden içerikler kaldırılır; tekrarlayan ihlallerde erişim engellenebilir.',
      ],
    },
    {
      id: 'illegal',
      title: '2. Yasadışı faaliyetler',
      paragraphs: ['Aşağıdaki ve benzeri yasadışı içerikler paylaşılamaz, teşvik edilemez veya bağlantı verilemez:'],
      bullets: [
        'Uyuşturucu, silah ve patlayıcı madde ticareti veya kullanımının teşviki',
        'Dolandırıcılık, sahte belge, kimlik hırsızlığı ve finansal suçlar',
        'Terör örgütlerini destekleme, şiddeti teşvik etme',
        'Çocuk istismarı veya sömürüsü içeren her türlü materyal',
        'Kişileri fiziksel veya maddi zarara yönlendiren talimatlar',
      ],
    },
    {
      id: 'gambling',
      title: '3. Bahis, kumar ve yasadışı bahis',
      paragraphs: [
        'Lisanslı olmayan bahis sitelerinin tanıtımı, yönlendirme linkleri, kupon paylaşımı ve kumar teşviki yasaktır.',
        'Sanal bahis, illegal bahis çetesi duyuruları ve kumar uygulamalarının reklamı derhal kaldırılır ve ilgili hesaplar kapatılabilir.',
      ],
    },
    {
      id: 'sexual',
      title: '4. Cinsellik ve müstehcen içerik',
      paragraphs: ['Platform haber ve topluluk odaklıdır. Aşağıdaki içerikler kabul edilmez:'],
      bullets: [
        'Pornografik veya açık cinsel içerik',
        'Rızasız paylaşılan mahrem görüntüler (revenge porn vb.)',
        'Cinsel taciz, cinsel şiddet veya istismar normalleştiren paylaşımlar',
        'Reşit olmayanları hedef alan cinsel ima veya içerik',
      ],
    },
    {
      id: 'harassment',
      title: '5. Nefret, taciz ve zararlı içerik',
      paragraphs: ['Ayrıca şunlar yasaktır:'],
      bullets: [
        'Irk, din, cinsiyet, cinsel yönelim veya engellilik temelli nefret söylemi',
        'Hedef gösteren taciz, tehdit ve zorbalık',
        'Sahte haber ve kasıtlı dezenformasyon',
        'Spam, dolandırıcı reklam ve yanıltıcı yatırım vaatleri',
      ],
    },
    {
      id: 'enforcement',
      title: '6. Uygulama ve bildirim',
      paragraphs: [
        'İhlal tespit edilen içerikler otomatik sistemler ve moderasyon ekibi tarafından incelenir; onay beklemeden kaldırılabilir.',
        'Şüpheli içerik gördüğünüzde gönderi üzerinden bildirim yapabilir veya destek@nahaber.app adresine yazabilirsiniz.',
        'Kayıt olmadan akışı kullanmaya devam ederek bu kuralları okuduğunuzu ve kabul ettiğinizi beyan etmiş olursunuz.',
      ],
    },
  ],
}
