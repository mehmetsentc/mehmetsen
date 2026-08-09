# Google Cloud / Firebase Fatura Raporu
**Tarih:** 2 Ağustos 2026 | **Dönem:** Temmuz 2026 (son fatura)

---

## ÖZET

| Hesap | Proje | Temmuz 2026 | Durum |
|---|---|---|---|
| My Maps Billing Account (`01F7CF-099A57-FCD7F6`) | NaHaberApp | **₺5,665** | ✅ Beklenen |
| Firebase Payment (`015865-A50C4D-45166E`) | BosphorusVibe + BiletFeed | **₺4,584** | 🚨 +1819% artış |
| My Billing Account 2 (`01D1A5-2FC295-355851`) | NaHaber (Gemini API) | **₺933** | ✅ Stabil |
| 9 diğer hesap | — | **₺0** | ⚠️ Boşta |
| **TOPLAM** | | **₺11,182/ay** | |

---

## 1. NaHaberApp — `nahaberapp` projesi
**Hesap:** My Maps Billing Account (`01F7CF-099A57-FCD7F6`)
**Temmuz toplam: ₺5,665**

| Servis | Maliyet | Değişim |
|---|---|---|
| App Engine (Firebase/Firestore) | ₺5,625.70 | +31% ⬆️ |
| Gemini API | ₺39.39 | ~stabil |
| Cloud Storage | ₺0.49 | +2350% (küçük miktar) |

**Açıklama:** NaHaber'in ana Firebase projesi. App Engine kalemi Firestore okuma/yazma + Firebase hosting + Authentication içeriyor. Önceki ay +31% artmış — önceki optimizasyonlar (cache, SSR) kısmen etki etmiş ama trafik artışı maliyeti yukarı çekmeye devam ediyor.

---

## 2. NaHaber Gemini API — `gen-lang-client-0531738067` projesi
**Hesap:** My Billing Account 2 (`01D1A5-2FC295-355851`)
**Temmuz toplam: ₺933**

| Servis | Maliyet | Ana SKU |
|---|---|---|
| Gemini API | ₺932.73 | gemini-3.6-flash output tokens: ₺779.56 |

**Açıklama:** NaHaber'in AI haber yazma pipeline'ının maliyeti. `gemini-3.6-flash` output token üretimi ana harcama kalemi. Önceki ayla aynı — stabil ve beklenen.

---

## 3. BosphorusVibe — `bosphorusvibe-dbd93` projesi 🚨
**Hesap:** Firebase Payment (`015865-A50C4D-45166E`)
**Temmuz toplam: ₺4,584 (önceki ay: ~₺240 → +1819%!)**

| Servis | Maliyet | Değişim |
|---|---|---|
| Cloud Run Functions | ₺4,520.00 | 🆕 YENİ (+1819%) |
| App Engine | ₺43.74 | -80% |
| Cloud Storage | ₺18.83 | -91% |
| Artifact Registry | ₺1.51 | 🆕 YENİ |

**Bağlı projeler:**
- BosphorusVibe (`bosphorusvibe-dbd93`): ₺4,583 — **ana maliyet**
- BiletFeed (`biletfeed`): ₺0.75 — ihmal edilebilir

**BosphorusVibe'daki Cloud Functions (12 adet):**

| Fonksiyon | RAM | Trigger | Bölge |
|---|---|---|---|
| `transcodeVideoPost` | 2 GB | Firestore tetikli | europe-central2 |
| `transcodeVideoPostOnUpdate` | 2 GB | Firestore tetikli | europe-central2 |
| `runVideoTranscodeBatch` | 2 GB | HTTP | europe-central2 |
| `runVideoThumbnailBatch` | 512 MB | HTTP | europe-central2 |
| `runStorageVideoSyncBatch` | 1 GB | HTTP | europe-central2 |
| `adminRunTranscodeBatch` | 2 GB | HTTP | europe-central2 |
| `configureAllVideoStorage` | 2 GB | HTTP | europe-central2 |
| `generateThumbnail` | 256 MB | Storage trigger | us-central1 |
| `onUserDeleted` | 256 MB | Firebase Auth | europe-central2 |

**Sorunun kökü:** `transcodeVideoPost` ve `transcodeVideoPostOnUpdate` fonksiyonları Firestore üzerindeki her video post oluşturma/güncelleme işleminde **otomatik tetikleniyor**. Her biri 2GB RAM kullanıyor. Temmuz'da bu fonksiyonlar çok sık çalışmış ve maliyeti sıfırdan ₺4,520'ye çıkarmış.

---

## 4. BiletFeed — `biletfeed` projesi
**Hesap:** Firebase Payment (`015865-A50C4D-45166E`)
**Temmuz toplam: ₺0.75**

Minimal maliyet, aktif kullanım yok gibi görünüyor.

---

## 5. Boşta Duran Hesaplar (₺0)

Aşağıdaki 9 hesap aktif harcama yapmıyor ancak kapatılmadığı sürece hesap karmaşıklığı yaratıyor:

| Hesap Adı | Account ID |
|---|---|
| Firebase Payment | 012BF8-A9EC50-F988DD |
| Firebase Payment | 016CCF-5E6A87-90E7C2 |
| Firebase Payment | 017CBE-F91985-5281B5 |
| Firebase Payment | 01BA25-86AC3C-13137E |
| Firebase Payment | 01DC18-A101AA-6C23F4 |
| Firebase Payment | 01F25C-84EF7C-EC9A26 |
| My Billing Account | 01A1FE-DE7413-E4F212 |
| My Billing Account 1 | 01337E-F50DEE-907ACA |
| My Maps Billing Account | 01F8B8-3C6969-55E11B |

---

## ÖNERİLER VE EYLEM PLANI

### 🚨 ACİL: BosphorusVibe Cloud Run Functions (₺4,520 tasarruf potansiyeli)

BosphorusVibe aktif bir üretim uygulaması değilse veya kullanım aralıklıysa:

1. **Firestore tetikli fonksiyonları devre dışı bırak** — `transcodeVideoPost` ve `transcodeVideoPostOnUpdate` durdurmak için Firebase Console'dan silinebilir veya Cloud Functions'da disable edilebilir
2. **2GB RAM'li fonksiyonları küçült** — video transcoding gerçekten 2GB gerektiriyorsa bu normal, ama fonksiyonlar boşta beklememeli
3. **Batch HTTP fonksiyonlarını sadece manuel tetikle** — sürekli tetiklenmiyorlarsa mevcut haliyle sorun yok
4. **Minimum instance'ı 0'a ayarla** — cold start'ı kabul ederek min-instances=0 yap (eğer 1+ ise)

Eğer BosphorusVibe aktif geliştirmede değilse tüm fonksiyonları sil → **Aylık ₺4,584 tasarruf.**

### ⚠️ İZLE: NaHaberApp App Engine +31% artış (₺5,626)

- Önceki optimizasyonlar (SSR cache, feed pool küçültme) devrede
- Ağustos ortasında tekrar kontrol et — artış devam ederse yeni Firestore sorgu analizi gerekli
- Cloud Firestore maliyet dökümü için SKU bazlı rapora bak (okuma vs yazma vs network)

### 📌 KAPATILACAK: 9 boşta hesap

Google Cloud Console > Billing > her hesap > "Close billing account" ile kapat. Bunlar genellikle eski Firebase projeleri oluştururken otomatik açılmış hesaplar.

---

## MALİYET DAĞILIMI (Temmuz 2026)

```
NaHaber (Firestore/Firebase)     ₺5,665  ████████████████████  50.7%
BosphorusVibe (Cloud Functions)  ₺4,584  ████████████████      41.0%
NaHaber (Gemini AI pipeline)     ₺  933  ████                   8.3%
─────────────────────────────────────────────────────────────────
TOPLAM                          ₺11,182
```

**NaHaber'e atfedilen toplam: ₺6,598/ay**
**BosphorusVibe'a atfedilen toplam: ₺4,584/ay**
