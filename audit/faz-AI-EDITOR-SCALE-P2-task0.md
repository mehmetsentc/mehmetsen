# SCALE P2 TASK 0 — ön-rapor (yazma yok)

Tarih: 23 Eylül 2026  
Proje: nahaberapp  
Karar: **DEVAM** — naif DeepSeek üst sınırı mevcut günlük hacmin 2 katını aşmıyor.

## (a) Firestore doküman sayısı

| Dalga | Editör | Not |
|---|---:|---|
| Wave 0 | 20 | Çanakkale+Antalya gazeteci masaları |
| Wave 1 | 790 | 79 il × 10 kategori (pilot 2 il atlandı, çift kayıt yok) |
| Wave 2 | 973 | ilçe geneli, kategori yok |
| Wave 3 | 120 | 15 ülke × 8 kategori |
| **Toplam** | **1903** | |

Her editör: 1 `aiEditors` + 1 `users` + 3 prompt (`core`/`news`/`review`) = 5 yazma.  
+ 1 `aiEditorialConfig/circuitBreaker`  

**Yazma:** 9516 · **okuma (seed get):** ~3806  
Firestore list fiyatı: yazma ~$0.017 · okuma ~$0.002 → **≈ $0.02**

Mevcut `aiEditors` sayısı: **112** (31 ulusal + 81 il; 20 şehir-kategori yok).

## (b) DeepSeek

Son 7 gün `aiUsageEvents`: 52 649 → **~7 521/gün**. Bugün (kısmi): 573. Bugün `news`: 117.

Naif üst sınır (her yeni masa `maxDailyNews=3` doldurur): 1903×3 = **5709 çağrı/gün**.  
Mevcut günlük usage’a oran: **0.76** (< 2×). Durma eşiği tetiklenmedi.

Gerçekçi üst sınır: pipeline hacmi (~117 haber/gün) yeniden dağılır; editör sayısı çağrı çarpanı değil. `maxDailyNews=3` popüler masayı kısar. Seed DeepSeek çağırmaz.

## Wave 3 ülke listesi (90g dunya sample, n=1500)

abd, iran, rusya, israil, almanya, fransa, ukrayna, birlesik-krallik, nepal, hindistan, filistin, italya, yunanistan, ispanya, japonya.

`countrySlug` WORLD_COUNTRIES (`ispanya` / `abd`), ISO-2 değil.

## STOP yok

Maliyet mantıklı. Sertleştirme + circuit breaker kodu yeşil. Dalgalar bundan sonra.
