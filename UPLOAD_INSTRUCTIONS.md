# NaHaber v1.1 Upload & Submit Talimatları

## Uyandığında Sırayla Yapman Gerekenler

---

## ADIM 1: .p8 Dosyasını Kaydet (KRİTİK!)

**Sağ ekranda (S9) Chrome'da bir "Farklı Kaydet" diyaloğu açık!**

- Dosya adı: `AuthKey_88PX7Q6W29`
- Klasör: `nahaber` (zaten seçili)
- → **"Kaydet" butonuna tıkla**

Bu dosya olmadan yükleme yapılamaz. Diyaloğu kapatma, iPtal etme!

---

## ADIM 2: IPA'yı App Store Connect'e Yükle

`.p8` dosyasını kaydettikten sonra:

1. Finder'ı aç
2. `/Users/user/nahaber/upload_altool.command` dosyasına çift tıkla
3. Terminal açılacak ve otomatik yükleme yapacak
4. "✅ UPLOAD BAŞARILI" çıkana kadar bekle

---

## Teknik Bilgiler (arka planda hazır)

| Öğe | Durum |
|-----|-------|
| IPA Dosyası | ✅ `/Users/user/Downloads/NaHaber_IPA/App.ipa` (2.5MB) |
| Archive | ✅ `/Users/user/Downloads/NaHaber_1.1.xcarchive` |
| API Key ID | `88PX7Q6W29` |
| Issuer ID | `0b4b2878-8080-476e-aafe-0bd515dce30c` |
| .p8 Key | ⏳ Kaydetmeyi bekliyor (yukarıdaki ADIM 1) |

---

## Neden Reddedildi? (v1.0)

Apple 2 sorun buldu:

### ✅ 1. Sign In with Apple - DÜZELTILDI (v1.1'de)
- **Sorun**: Apple Sign In tarayıcıda (Safari) açılıyordu
- **Çözüm**: v1.1'de native `ASAuthorizationAppleIDProvider` kullandık

### ⚠️ 2. "Take Photo" Crash - Kontrol Etmeli
- **Sorun**: Reviewer iPad'de "Take Photo" butonuna bastığında app çöktü
- **Etkilenen cihaz**: iPad Air 11-inch (M3), iPadOS 26.5
- **Çözüm**: NaHaber'de kamera özelliği var mı? Varsa test et ve düzelt

---

## App Store Connect'e Giriş

- URL: https://appstoreconnect.apple.com/apps/6784465855
- Güncel durum: iOS 1.0 Rejected
- Upload sonrası yeni build v1.1 olarak görünecek

---

## Upload Başarılı Olursa Ne Yapmalı?

1. App Store Connect → NaHaber → Distribution'a git
2. "iOS App" → yeni 1.1 versiyonu oluştur (veya 1.0'ı güncelle)
3. Yeni build'i seç
4. "Submit for Review" yap
