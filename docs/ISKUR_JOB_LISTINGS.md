# İş ilanları (şehir siteleri)

Şehir tenant’larında `/is-ilanlari` sayfası Kariyer.net + İŞKUR açık iş ilanlarını listeler.

## Kaynaklar

### Kariyer.net (birincil doldurma)

- Apify actor: `fatihtahta/kariyer-net-scraper`
- Şehir URL: `https://www.kariyer.net/is-ilanlari/{citySlug}` (TR geneli değil)
- Env: `APIFY_TOKEN`, opsiyonel `KARIYER_SYNC_CITIES`, `KARIYER_LIMIT` (varsayılan 200)
- Attribution: **Kaynak: Kariyer.net**

### İŞKUR

- Apify actor: `sevimliai/iskur-ilan-scraper-email`
- Endpoint: `POST /v2/acts/sevimliai~iskur-ilan-scraper-email/run-sync-get-dataset-items`
- Ürün UX: Firestore `jobListings` (e-posta actor zorunluluğu; board e-postaya bağlı değil)
- Attribution: **Kaynak: İŞKUR** — sahte ilan üretilmez

Cron `/api/cron/iskur-jobs` her iki kaynağı da çalıştırır (`syncAllJobListings`).

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
