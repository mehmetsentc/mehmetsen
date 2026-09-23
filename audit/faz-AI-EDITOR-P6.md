# FAZ AI-EDİTÖR P6

Tarih: 23 Eylül 2026  
Deploy yok. Track B/C’de AI çağrısı yok. `EDITORIAL_MEMORY_MODE` hâlâ SHADOW. Enjeksiyon hâlâ kapalı.

---

## TRACK A — Seçici stil yazması

`refreshStylePromptsFromSeed(changedBy, excludeEditorSlugs?)` ve `previewStyleRefreshFromSeed(excludeEditorSlugs?)` eklendi. Parametre yoksa davranış eski. Test: 6/6 (exclude listesi yazma yapmaz).

### Dry-run (atlamalı preview)

8 editör atlandı. Kalan 124. Manuel risk **0**. 210 prompt değişik, 115 editörde.

### Gerçek yazma

`changedBy: p6-selective-style-refresh`  
**Güncellenen editör: 124.** Atlanan: 8.

**8 atlanan dokunulmadı** (`excludedAllUnchanged: true`):  
`selin-aras`, `arda-sahin`, `ece-yalin`, `mert-karaca`, `defne-aksoy`, `kerem-aydin`, `deniz-erdem`, `ipek-demir`.

**Örnek 5 (hepsi `news` v1→v2, `changeReason=refreshStylePromptsFromSeed`, seed ile eşleşiyor):**

| Slug | news v önce → sonra | memoryEnabled |
|---|---|---|
| `yerel-eskisehir` | 1 → 2 | **true** (korundu) |
| `yerel-canakkale` | 1 → 2 | false |
| `yerel-antalya` | 1 → 2 | false |
| `can-tunc` | 1 → 2 | false |
| `melis-kaya` | 1 → 2 | false |

Kanıt: `audit/faz-P6-style-refresh-dryrun.json`, `audit/faz-P6-style-refresh-apply.json`.  
Yazma izole `cursor/ai-style-p4-integrate` (P1.1 DNA) üzerinden yapıldı.

---

## TRACK B — Kalibrasyon

### B1 İnsan etiketleri

`audit/faz-P6-memory-human-labels.json` — Mehmet, 23 Eylül 2026, 4/4 **NOT_RELATED**.

| Sorgu | Aday | Kanıt | Etiket |
|---|---|---|---|
| Burç (Koç) | Kayseri tanker | `SHARED_TOPIC_TOKEN` | NOT_RELATED |
| Kadir İnanır mirası | Yeraltı dizisi sezonu | `SHARED_TOPIC_TOKEN` | NOT_RELATED |
| Kayseri tanker | Çanakkale ahır yangını | `SHARED_TOPIC_TOKEN` + `SUMMARY_OVERLAP` | NOT_RELATED |
| Ayhan Salman / Karabiga | Çanakkale ahır yangını | `SHARED_GEO` | NOT_RELATED |

### B2 Eşik önerisi (kod değişmedi)

`editorialMemoryRetrieval.ts` / `labelRelationship` **bu fazda değişmedi**.

Öneri (sonraki faz, n=4 hâlâ küçük): `POSSIBLY_RELATED` yalnızca kanıt kümesinde `SHARED_NAMED_TOKEN`, `SHARED_NUMBER` veya `TITLE_OVERLAP`’ten en az biri varsa üretilsin. Yalnız `SHARED_TOPIC_TOKEN` / `SHARED_GEO` / `SUMMARY_OVERLAP` (tek veya kombinasyon) gösterilmesin (aday düşür / UNRESOLVED). Gerekçe: 4/4 insan etiketi NOT_RELATED; iki-kanıtlı topic+summary de yanlış pozitif.

### B3 SHADOW devam

`audit/faz-P6-memory-shadow-sample.json` — 15 sorgu, `selfMatchCount: 0`, enjeksiyon false, `memoryEnabled` yalnız `yerel-eskisehir`. PG 2–7g hâlâ **0 published**; sonuç bucket 2–7g boş. 8–30g: 3, 1–3ay: 1.

---

## TRACK C — `pipeline_persist`

`src/lib/ai/usage/pipelinePersist.ts` + `pipeline.ts` persist dönüşleri (published / draft_created / updated). Gate/yayın akışı değişmedi. `editorBestExamples` dokunulmadı.

Test (4/4): event `newsId`+`editorId`+`traceId`+`published` taşır. Aynı ALS `traceId` ile:

- `stage4_gate` / `gate_keep` — `traceId=trace-p6-join`, `newsId` yok
- `pipeline_persist` / `publish_confirmed` — aynı `traceId`, `newsId=news_published_1`, aynı `editorId`

Birleştirme anahtarı: **`traceId`**.

---

## HUMAN DECISION REQUIRED

1. **Track A:** 8 elle özelleştirilmiş editörün promptları elle mi kalacak, yoksa DNA ayrı bir insan onayıyla mı taşınacak?
2. **Track B:** Yukarıdaki eşik önerisi bir sonraki fazda kodlansın mı? (n=4; 2–7g PG korpusu hâlâ boş.)
3. **Track C:** `editorBestExamples` / prompt enjeksiyonu entegrasyonu başlasın mı? (Hâlâ ayrı faz; telemetri birikimi yeni `editorId` + `pipeline_persist.newsId` ile devam eder.)
