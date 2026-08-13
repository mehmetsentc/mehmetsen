# İŞKUR iş ilanları (şehir siteleri)

Şehir tenant’larında `/is-ilanlari` sayfası İŞKUR açık iş ilanlarını listeler.

## Kaynak

- Apify actor: `sevimliai/iskur-ilan-scraper-email`
- Endpoint: `POST /v2/acts/sevimliai~iskur-ilan-scraper-email/run-sync-get-dataset-items`
- Ürün UX: Firestore `jobListings` (e-posta actor zorunluluğu; board e-postaya bağlı değil)
- Attribution: **Kaynak: İŞKUR** — sahte ilan üretilmez

## Operatör uyarısı

Actor **gerçek İŞKUR hesabı** (TC Kimlik + şifre) ister. Hesap ToS / uyumluluk riski operatöre aittir. Credentials asla commit edilmez.

## Gerekli env

| Değişken | Açıklama |
|----------|----------|
| `APIFY_TOKEN` | Apify API token |
| `ISKUR_TC_KIMLIK_NO` | Actor `tcKimlikNo` |
| `ISKUR_SIFRE` | Actor `sifre` |
| `ISKUR_EMAIL_RECIPIENT` | Actor `recipientEmail` (iç kutu olabilir) |
| `ISKUR_EMAIL_SENDER` | Actor `senderEmail` |
| `ISKUR_EMAIL_PASSWORD` | Actor `emailPassword` |

Opsiyonel: `ISKUR_SMTP_HOST`, `ISKUR_SMTP_PORT`, `ISKUR_EMAIL_SUBJECT_PREFIX`, `ISKUR_ISYERI_TURU`, `ISKUR_ILAN_TARIHI`, `ISKUR_ILAN_TURU`, `ISKUR_SYNC_CITIES`.

## `il` eşlemesi

`citySlug` → Türkçe il adı (büyük harf), örn. `canakkale` → `ÇANAKKALE`, `istanbul` → `İSTANBUL`.

## Cron

- Path: `/api/cron/iskur-jobs`
- Schedule: `0 6 * * *` (09:00 Europe/Istanbul)
- Şehirler sırayla çekilir (`ISKUR_SYNC_CITIES`, varsayılan `canakkale`)

Token yoksa sync atlanır; sayfa boş durum + admin kurulum uyarısı gösterir.
