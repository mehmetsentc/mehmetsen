# AI Editör kimlik backfill

Tarih: 23 Eylül 2026  
Deploy yok. Slug’lar değişmedi. Stil prompt yazması yok. 8 özelleştirilmiş ulusal editörün adı korunur.

## Ne değişti

Parametric masa isimleri (`ABD Spor AI`, `Amasya Spor AI`, `Acıgöl (Nevşehir) AI`) gerçek gazeteci adına döndü. ABD masaları Amerikan isim havuzu; il/ilçe masaları Türk isim havuzu. Her editöre Dicebear portre + kapak URL.

## Firestore yazması

`scripts/_ai_editor_identity_backfill.ts --apply`

| | |
|---|---|
| Taranan | 2015 |
| Yama | 2015 |
| Yeniden adlandırılan | 1883 |
| Yazılan | 2015 |
| Hata | 0 |

Örnek: `ulke-abd-spor` **ABD Spor AI → Chloe Whitman**. `il-amasya-spor` fabrika etiketi → Türk gazeteci adı.

Dokunulmayan adlar: `selin-aras`, `arda-sahin`, `ece-yalin`, `mert-karaca`, `defne-aksoy`, `kerem-aydin`, `deniz-erdem`, `ipek-demir` — yalnızca eksik medya dolduruldu.

## Kod

- `scaleEditorPersona.ts` — ülke bazlı isim havuzu, portre/kapak, `identityPatchForEditor`
- Ülke / il / ilçe factory `name` + `avatarUrl` + `coverUrl`
- Admin liste avatar, detay kapak/profil alanları
- `seedOne` mevcut kayıtlarda adı/medyayı günceller; kilitli 8 slug’ın adını ezmez

Admin listedeki fotoğraflar UI deploy’u ister; isimler Firestore’dan canlı okunur.
