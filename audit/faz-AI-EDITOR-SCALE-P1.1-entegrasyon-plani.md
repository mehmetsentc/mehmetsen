# FAZ AI-EDITOR-SCALE P1.1 — İNŞA NOTU + PRODUCTION ENTEGRASYON PLANI

Tarih: 23 Eylül 2026  
Dal: `cursor/ai-editor-scale-p1-1`  
Worktree: `/Users/user/nahaber/.worktrees/ai-editor-scale-p1-1`  
Hedef SHA (faz başı): `6ccdf409e05762da9871b5123dc9db31ca180d5a`  
Üretim `/api/health`: `version=6ccdf40`, `env=production`, `region=fra1` (bu oturumda doğrulandı)

Bu belge TASK 1 bulgularını ve TASK 2 planını tutar. Firestore yazımı, deploy, flag açma yok.

---

## TASK 1 — İl-kategori pilotu (salt okunur)

**Düzeltme:** Claude analiz belgesi, 20 şehir-kategori masasının yalnızca `cursor/ai-style-p1-3-preview` içinde olduğunu sanıyordu. Bu **yanlış**.

`seedCityCategoryEditors.ts` **production hedefinde** (`6ccdf40`) duruyor:

- `allSeedEditorSpecs()` = 31 ulusal + 81 il + 20 Çanakkale/Antalya kategori masası = **132**
- `pickAiEditorFromList`: şehir + kategori varsa, `slug !== yerel-{il}` olan local_editor ulusal masayı yener (Çanakkale Spor → `yigit-anafarta`, Deniz Erdem değil)
- Test kanıtı: `routes Çanakkale spor to the city category desk`

`cursor/ai-style-p1-3-preview` (`9097d34`) bu dosyayı **içermez**. P1.3, High-Engagement DNA dalıdır; şehir masası başka bir feed/city commit zincirinden (`b938576` overlay) hedefe girmiştir.

### Router sırası (bugün, flag kapalı)

1. preferred editor
2. şehir + kategori → kategori masası, yoksa `yerel-{il}`
3. köşe formatı
4. breaking / son-dakika → Arda (ama adım 2 `son-dakika`’yı şehir Güncel masasına (`nisa-korhan`) çekebilir — `DESK_EXTRA_IDS.gundem` son-dakika’yı içerir)
5. yerel kategori ağacı → il genel / Burak
6. ulusal kategori fallback

### 81 il ile çakışma

- İl genel: `yerel-canakkale` (şablon)
- İl kategori: benzersiz gazeteci slug (`nisa-korhan` …) — parametrik `yerel-canakkale-spor` değil
- Test: ulusal + 81 il + 20 masa slug/ad **unique**
- Fallback: her kategori masası `fallbackEditorSlug: yerel-{city}`

### Quality gate

Promptlar `GLOBAL_NEWSROOM_RULES` + `SHARED_NEWS_STYLE` kullanır. Ayrı bir kapı yolu yok; mevcut `editorialQualityGate` ile uyumlu. P1.1 filler/clickbait taraması bu hedefte yok (P1.3 dalında).

### Seed riski

`seedDefaultAiEditors()` 20 kişilik masayı **yazmaya hazır**. Admin “Seed / Sync Roster” canlıda bu 20 kaydı oluşturabilir. Bu faz o butona basmadı.

---

## TASK 2 — Production entegrasyon planı (kör cherry-pick yok)

P1.3 Style ile bu faz **aynı dalda birleştirilmemeli**. Şehir masaları zaten hedefte.

### A — Ölç (yazmadan)

1. Firestore’da 20 slug’un (`nisa-korhan` … `nazli-kaleici`) gerçekten seed edilip edilmediğini oku.
2. Canlı router log/örnek: Çanakkale spor byline `yigit-anafarta` mı `deniz-erdem` mi.
3. `refreshStylePromptsFromSeed` çalıştırma.

### B — Style reconcilation ayrı

P1.3 HUMAN GO sonrası High-Engagement DNA, `6ccdf40+` üzerine taze cherry-pick/rebase ister. Şehir masası dosyalarıyla çakışma: `promptBuilder.ts` / `seedEditors.ts` / `editorRouter.ts`. Kör `git cherry-pick 9097d34` **önerme**.

### C — SCALE şablonları (bu dal)

1. Flag `EXPANDED_EDITOR_HIERARCHY_ENABLED` kapalı kalsın.
2. `buildCountryEditorSpec` / `buildDistrictEditorSpec` seed roster’a eklenmesin (şu an ekli değil).
3. Admin arama/filtre UI’si sıfır-davranışlı production adayı olabilir; ayrı onay + `[deploy]` politikası.
4. İlk gerçek Firestore kaydı: kullanım eşiği + 1 ilçe veya 1 ülke genel — tam ızgara değil.

### D — Deploy

`ignoreCommand` / `[deploy]` politikasına uy. `[force-deploy]` otomatik değil. Health SHA ancestry kanıtı.

---

## Bu fazda yapılan kod (TASK 3–7)

- `buildCountryEditorSpec()` + 3 ülke dry-run
- `buildDistrictEditorSpec()` + 3 Çanakkale ilçesi dry-run
- Router zinciri flag arkasında, varsayılan **false**
- Admin listesine katman/bölge/kategori arama+grup
- `allSeedEditorSpecs` değişmedi (132)

---

**HUMAN DECISION REQUIRED.** Sonraki faz (Firestore pilot kaydı, flag açma, production seed, P1.3 birleşimi) bu belgeden otomatik başlamaz.
