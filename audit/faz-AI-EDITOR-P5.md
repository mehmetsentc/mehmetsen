# FAZ AI-EDİTÖR P5

Tarih: 23 Eylül 2026  
Sıfır AI çağrısı. `refreshStylePromptsFromSeed()` **çalıştırılmadı**. Prompt enjeksiyonu yok. Production yazması yok. Deploy yok.

---

## TRACK A — Stil yenileme risk taraması (salt okunur)

`previewStyleRefreshFromSeed()` kaynak olarak salt okunur doğrulandı: gövdesinde `setPromptVersion` / `updateAiEditor` / `.set(` / `.update(` / `.delete(` yok; yalnızca `getAiEditorBySlug` + `getActivePrompt`. Yazma fonksiyonu çağrılmadı.

Çalıştırma: izole `cursor/ai-style-p4-integrate` @ `3eb12b6` (P1.1 DNA + preview burada; p1-1 dalında preview yok). 132 seed editör, 374 prompt.

| Özet | Sayı |
|---|---|
| Seed editör | 132 |
| Kontrol edilen prompt | 374 |
| İçerik farklı (`changed`) | 232 |
| Aynı | 142 |
| **`manualCustomizationRisk: true`** | **16** |
| Eksik editör | 0 |

**Elle özelleştirilmiş görünen 8 editör (her birinde `core` + `news`, gerekçe: `Admin karakter/tarz paneli`):**

- `selin-aras`
- `arda-sahin`
- `ece-yalin`
- `mert-karaca`
- `defne-aksoy`
- `kerem-aydin`
- `deniz-erdem`
- `ipek-demir`

Tam tarama: `audit/faz-P5-style-refresh-preview.json`

Bu 16 prompt, onaylı bir `refreshStylePromptsFromSeed()` çalıştırmasında **sessizce ezilir**. Risk sıfır değil — yazma taramaya hazır değil; önce bu 8 editör korunmalı veya bilinçli olarak üzerine yazılmalı.

---

## TRACK B — Memory SHADOW

Mod hâlâ **SHADOW**. `isEditorialMemoryInjectionEnabled()` **false**. `memoryEnabled` yalnızca **`yerel-eskisehir` / Işıl Dinç**. Başka `local_editor` açık değil.

### B1 Self-match

Stage A SQL zaten `ne(news.id, articleId)` uyguluyordu; P4 örneklerinde `articleId` geçirilmediği için aynı başlık self-match oluyordu. P5:

- JS savunma katmanı güçlendirildi (`passesSelfAndFutureExclusion` + sonuç döngüsü + dedupe).
- Test: kendi ID’si + kardeş eşleşme → sonuçta yalnızca kardeş, `self_article` yok.

**61/61** ilgili test geçti (`editorialMemoryRetrieval.a3` + `editorialMemoryMode.a3` + Stage3/P5 gate). Canlı 15 sorguda `selfMatchCount: 0`.

### B2 Genişletilmiş örneklem

`audit/faz-P5-memory-shadow-sample.json` — **15 sorgu**, hepsinde `articleId` var.

**PG canonical `news` ince:** published toplam ~5. 2–7g: **0**. Eskişehir: **0**. 8–30g: 4. 1–3ay: 1. Bu yüzden **2–7g sonuç bucket’ı boş** — aday yok, kalibrasyon hatası değil. 10–15 sorgu için Firestore published başlıklar salt okunur kullanıldı.

| Sorgu penceresi | Adet |
|---|---|
| 0–2g (Firestore, çoğunlukla Eskişehir) | 10 |
| 8–30g | 3 |
| 1–3ay | 2 |

Sonuç yaşları (PG aday): **8–30g: 5**, **1–3ay: 1**, **2–7g: 0**.

**POSSIBLY_RELATED insan etiketi (tek kanıt):**

| Sorgu | Aday | Tek kanıt |
|---|---|---|
| Burç yorumu (1–3ay) | Kayseri tanker kazası | `SHARED_TOPIC_TOKEN` |
| Burç yorumu (1–3ay) | Çanakkale ahır yangını | `SHARED_TOPIC_TOKEN` |
| Kayseri tanker (8–30g) | Burç yorumu | `SHARED_TOPIC_TOKEN` |
| Kadir İnanır mirası (0–2g, magazin) | Yeraltı dizisi sezonu | `SHARED_TOPIC_TOKEN` |
| Karabiga / Ayhan Salman (0–2g) | Çanakkale ahır yangını | `SHARED_GEO` (tek kanıt; topic değil) |

`SHARED_TOPIC_TOKEN`-only hâlâ ON için engel. İnsan etiketleme bu listeden başlayabilir; 2–7g bucket ancak PG’ye taze canonical haber düşünce kalibre edilir.

---

## TRACK C — `editorId` telemetrisi

`multiStageEditor.ts` `stage4_gate` `recordAiRequestUsage()` çağrısına `editorId: input.aiEditorId` eklendi. Pipeline zaten `aiEditorId: routedEditor?.id` geçiriyor. `newsId` zorlanmadı. `editorBestExamples.ts` dokunulmadı. Gate kararı / skor / yayın akışı değişmedi.

Test: `stage4_gate` event’inde `editorId === 'ai_editor_yerel-eskisehir'`. Geçti.

`tsc --noEmit`: **1** önceden var olan hata, P5 dışı (`factChecker.test.ts` — `AiRewriteResult.spot` eksik). P5 dosyalarında yeni tsc hatası yok.

### `newsId` tasarımı (implementasyon yok)

Gate, haber persist edilmeden çalışır; o anda gerçek `newsId` yok. Event’i sonra güncellemek `requestId`’yi pipeline boyunca taşımayı + Firestore update yazmasını ister (yarış, ekstra yazma).

**Öneri (sonraki faz):** persist noktalarında (`published` / `created` / `updated` dönüşleri, `pipeline.ts` ~2229–2269) ikinci, düşük hacimli event:

- `agentName: 'pipeline_persist'`
- `operation: 'publish_confirmed' | 'draft_created' | 'updated'`
- `newsId`, `editorId` (`routedEditor.id`), `traceId` (ALS), `published`, isteğe bağlı `gateDecision` / `publishScore`

`stage4_gate` ile birleştirme anahtarı: **`traceId`**. ALS’e `newsId` sonradan yazmak kapı event’ini geri doldurmaz. Best-examples sorgusu `editorId` dolunca süzebilir; `newsId` bu ikinci event + join ile gelir.

---

## HUMAN DECISION REQUIRED

1. **Track A:** 16 elle özelleştirilmiş prompt (8 editör, `core`+`news`) varken `refreshStylePromptsFromSeed()` çalıştırılsın mı? Çalıştırılırsa bu 16 ezilir. Alternatif: bu 8 editörü atla / koru, kalan 216 `changed` (makine gerekçeli) için ayrı onay.
2. **Track B:** `SHARED_TOPIC_TOKEN`-only (ve bir `SHARED_GEO`-only) POSSIBLY_RELATED satırları insan etiketlemeye hazır. `EDITORIAL_MEMORY_MODE=ON` **hâlâ hayır**. 2–7g PG korpusu boş — ON öncesi taze canonical haber + etiket şart mı?
3. **Track C:** `pipeline_persist` ikinci event tasarımı bir sonraki fazda uygulansın mı? (`editorBestExamples` / prompt enjeksiyonu hâlâ ayrı faz.)
