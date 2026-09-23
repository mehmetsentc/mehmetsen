# FAZ AI-EDİTÖR STYLE+MEMORY+LEARNING P4

Tarih: 23 Eylül 2026  
`refreshStylePromptsFromSeed()` **çalıştırılmadı**. Prompt enjeksiyonu yok. Production deploy yok.

---

## TRACK A — AI-STYLE

### A1 Entegrasyon
P1.1 (`3853928`) NZhLO (`711a8c5`) atasında değil. Dosya kesişimi (3): `src/app/api/admin/ai-editors/route.ts`, `src/lib/ai/editorial/aiEditorService.ts`, `src/lib/ai/editorial/seedEditors.ts`.

İzole deneme `cursor/ai-style-p4-integrate` @ `3eb12b6`: git auto-merge **conflict yok**. SCALE `listAiEditors` limiti 4000 korundu; DNA `NEWS_FORMAT_LOCK` eklendi. Test: Style P1.1 + SCALE hardening **21/21**. **Push edilmedi.**

### A2 Gerçek AI önizleme
16/16 DeepSeek çağrısı. Token 42312 in / 15224 out. Kaba maliyet **$0.0102**.

Kaynak (canlı Firestore published): *Şehit yakınları ve gazilere yeni haklar Meclis'te kabul edildi*.

**Tam metin:** `audit/faz-P4-style-live-preview.md`

Kısa gözlem: YENİ DNA başlıkları daha çok somut rakamı öne alıyor (`Aylıklar asgari ücret seviyesine çıkarıldı`); ESKİ daha düz özet başlık. Gövde her iki tarafta da kaynak olgularına bağlı kaldı; boş “bomba gibi düştü” şablonu görülmedi.

### A3 STOP
`refreshStylePromptsFromSeed()` hâlâ admin’de özelleştirilmiş promptları sessizce ezer. Bu fazda düzeltilmedi.

---

## TRACK B — Editorial Memory SHADOW

A3 kodu NZhLO’da zaten vardı. P4 A2.1 hizası: `canBeMemoryContext` artık **CANONICAL + LEGACY_ALLOWED** (LOW trust). `promptBuilder` dokunulmadı. `isEditorialMemoryInjectionEnabled()` hâlâ `false`.

### Pilot
**`yerel-eskisehir` / Işıl Dinç** (`ai_editor_yerel-eskisehir`).  
Gerekçe: `personaType=local_editor`, tek `citySlug=eskisehir`, mega kent değil, ilçe-genel değil. `memoryEnabled=true` **yalnız bu editörde**. Başka local_editor’da yok.

`EDITORIAL_MEMORY_MODE`: bu süreçte SHADOW; Vercel production env **ayarlannadı** (varsayılan OFF). Admin retrieval zaten mod’dan bağımsız.

### Shadow örnekleri
`audit/faz-P4-memory-shadow-sample.json`

- Aynı başlık 8–30g pencerede **LIKELY_RELATED** (kendi kaydı; sorguda `articleId` yoktu — kalibrasyonda self-id verilmeli).
- Kayseri tanker kazası → **LIKELY_RELATED** (isim+sayı+başlık) + **POSSIBLY_RELATED** Çanakkale ahır yangını ve burç yorumu (**yalnız SHARED_TOPIC_TOKEN**). İkinci grup A2.1’deki tehlikeli eşleşme riski — ON öncesi insan etiketi şart.

---

## TRACK C — Kendinden öğrenme

### C1 Doğrulama — `newsId` / `editorId` üretimde BOŞ
Son 250 `aiUsageEvents`: `publishScore` ve `gateDecision` **54/54** `stage4_gate` satırında dolu. **`editorId=0`, `newsId=0`.**

Neden:
- `multiStageEditor.ts` `recordAiRequestUsage` (stage4) skor yazar, **editorId/newsId vermez**.
- `newsId` context’ten gelir; gate, haber persist edilmeden çalışır.
- `pipeline.ts` `recordAiUsage({ editorId })` telemetry açıkken token yoksa **hiç yazmaz**.

**C2 canlı sorgu atlandı** (talimat: doldurulmuyorsa C2’ye geçme). `editorBestExamples.ts` tasarım iskeleti duruyor; üretimde örnek dönmez.

### C3 Tasarım (entegrasyon YOK)
`formatPastNewsForPrompt` yanına eklenecek blok (henüz `promptBuilder`’a girmiyor):

```
SENİN DAHA ÖNCE YAZDIĞIN, YÜKSEK PUAN ALAN ÖRNEKLER — bu tarzda devam et (kopyalama yok; yeni habere uyarla):
1. "Belediye otobüs seferlerini artırdı" — Sabah pik saatlerine üç ek sefer. (2026-09-01, skor 88)
2. "Üniversite yeni dönem kaydını uzattı" — Kayıt 7 Ekim’e kadar. (2026-08-20, skor 84)
```

C1 onarılmadan bu blok boş kalır.

---

## HUMAN DECISION REQUIRED

1. **Track A:** 16 örnek onaylanırsa `refreshStylePromptsFromSeed` ayrı onayla mı çalıştırılacak? (Özelleştirilmiş prompt ezer.)
2. **Track B:** SHADOW sonuçları (özellikle SHARED_TOPIC_ONLY false-positive) insan etiketlenmeden `EDITORIAL_MEMORY_MODE=ON` **yapılmamalı**. Ne zaman kalibrasyon?
3. **Track C:** `stage4_gate` event’lerine `editorId`+`newsId` yazılsın mı, ondan sonra mı prompt’a örnek blok eklensin?

Bu fazda (1)(2)(3) hiçbiri otomatik ilerlemez.
