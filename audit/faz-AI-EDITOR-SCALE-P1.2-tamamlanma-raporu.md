# FAZ AI-EDITOR-SCALE P1.2 — TAMAMLANMA RAPORU

Tarih: 23 Eylül 2026  
Dal: `cursor/ai-editor-scale-p1-1`  
Worktree: `/Users/user/nahaber/.worktrees/ai-editor-scale-p1-1`  
Hedef SHA: `6ccdf40`  
Firestore proje: `nahaberapp`  
Yazma: **0** (`set`/`update`/`create` yok)  
Flag: `EXPANDED_EDITOR_HIERARCHY_ENABLED` **false**  
Deploy: yok · DeepSeek: yok · P1.3 dalı: dokunulmadı

---

## TASK 1 + 4 — 20 şehir-kategori slug Firestore durumu

Salt okunur: `aiEditors/{ai_editor_<slug>}.get()`, yoksa `where('slug'==).limit(1).get()`, prompt’lar `aiEditorPrompts` aktif `.get()`.

Kontrol (bağlantı çalışıyor):

| slug | var | changeReason (aktif prompt’lar) | updatedAt |
|---|---|---|---|
| `defne-aksoy` | var | core/news: `Admin karakter/tarz paneli` (v3); column: `refreshStylePromptsFromSeed` (v2) | 2026-08-26 |
| `yerel-canakkale` | var | `initial` (core/news/review v1) | 2026-08-26 |

**20 Çanakkale + Antalya kategori masası: hiçbiri kayıtlı değil.**

| slug | il | masa | var? | changeReason | updatedAt |
|---|---|---|---|---|---|
| nisa-korhan | canakkale | Güncel | yok | — | — |
| tarik-akbay | canakkale | Siyaset | yok | — | — |
| eren-soysal | canakkale | 3. Sayfa | yok | — | — |
| melike-tuna | canakkale | Ekonomi | yok | — | — |
| ceren-akkilic | canakkale | Yaşam | yok | — | — |
| beril-yurtseven | canakkale | Eğitim | yok | — | — |
| sinan-aladag | canakkale | Kültür | yok | — | — |
| aslihan-kepez | canakkale | Turizm | yok | — | — |
| yigit-anafarta | canakkale | Spor | yok | — | — |
| gokce-truva | canakkale | Duyuru | yok | — | — |
| lara-kumral | antalya | Güncel | yok | — | — |
| kaan-serik | antalya | Siyaset | yok | — | — |
| baran-kale | antalya | 3. Sayfa | yok | — | — |
| sibel-manavgat | antalya | Ekonomi | yok | — | — |
| eylul-belek | antalya | Yaşam | yok | — | — |
| onur-aksu | antalya | Eğitim | yok | — | — |
| mira-perge | antalya | Kültür | yok | — | — |
| defne-side | antalya | Turizm | yok | — | — |
| bora-alanya | antalya | Spor | yok | — | — |
| nazli-kaleici | antalya | Duyuru | yok | — | — |

Ham çıktı: `audit/faz-AI-EDITOR-SCALE-P1.2-firestore-get.json`

**Sonuç:** 20 masa kodda (`allSeedEditorSpecs` = 132) production-seed-ready; canlı `listAiEditors()` onları görmez. Çanakkale spor canlıda `yigit-anafarta` değil, ulusal spor (`deniz-erdem`) yoluna düşer. Unit testler in-memory seed kullanır; bu boşluk test yeşilini canlı routing ile karıştırmamalı.

Admin “Seed / Sync Roster” `seedDefaultAiEditors()` 132 spec’in hepsini gezer: 20’yi **create**, mevcut 31+81’in profil alanlarını **update** eder (prompt’ları `refreshStylePromptsFromSeed` olmadan ezmez). Defne’nin Admin-panel core/news’i kalır; title/bio seed’e çekilir. Bu yüzden 20’yi basmak ayrı, dar bir create olmalı — tam roster sync değil.

---

## TASK 2 — Aday A / Aday B (YAZILMADI)

JSON: `audit/faz-AI-EDITOR-SCALE-P1.2-pilot-proposal.json`  
Prompt metinleri P1.1 dry-run ile aynı: `scripts/_ai_editor_scale_p1_1_dryrun_output.md`

Router’da devreye girmesi için **`EXPANDED_EDITOR_HIERARCHY_ENABLED=true` şart.** Flag kapalıyken ülke/ilçe katmanı `filterEditorsForCurrentHierarchy` ile routing’den çıkar (P1.2 hazırlık; flag açılmadı).

`createAiEditor` / `seedOne` artık `countrySlug` / `districtSlug` / `editorLayer` persist eder. `allSeedEditorSpecs()` hâlâ ülke/ilçe eklemez. `refreshStylePromptsFromSeed` **dokunulmadı**.

### Aday A — İspanya genel

| | |
|---|---|
| slug | `ulke-es` |
| id | `ai_editor_ulke-es` |
| layer | country · `countrySlug=es` · `categoryIds=['dunya']` |
| fallback | `defne-aksoy` |
| editor | `aiEditors/ai_editor_ulke-es` |
| user | `users/ai_editor_ulke-es` |
| prompts | `aiEditorPrompts/ai_editor_ulke-es__{core,news,review}__v1` · `changeReason=initial` |

Flag açık + `countrySlug=es` (categoryHint İspanya metninde zaten doldurur) → Defne yerine bu masa. Flag kapalı → leftover inert.

### Aday B — Biga genel

| | |
|---|---|
| slug | `ilce-canakkale-biga` |
| id | `ai_editor_ilce-canakkale-biga` |
| layer | district · city `canakkale` · district `biga` · `categoryIds=['yerel-haber']` |
| fallback | `yerel-canakkale` (Firestore’da var) |
| editor | `aiEditors/ai_editor_ilce-canakkale-biga` |
| user | `users/ai_editor_ilce-canakkale-biga` |
| prompts | `aiEditorPrompts/ai_editor_ilce-canakkale-biga__{core,news,review}__v1` |

Flag açık + Biga konum sinyali → ilçe genel, yoksa `yerel-canakkale` (20 masa zaten yok). Flag kapalı → leftover inert.

### Tam prompt — Aday A `ulke-es`

**core**

```
Sen NaHaber dijital newsroom'unda çalışan profesyonel bir AI editörsün.
Yalnızca verilen ve erişilen kanıtlara dayanan özgün Türkçe gazetecilik üret.
Olguları, alıntıları, sayıları, tarihleri, yerleri, isimleri, kaynakları veya tanıklıkları UYDURMA.
Doğrulanmış bilgi ile iddia / gelişen durumu ayır.
Mobil okuma için kısa paragraflar; net Türkçe; sansasyon ve clickbait yok.
Sayıları kaynakla birebir koru (dönüşüm gerekiyorsa matematiksel olarak doğrula).
Kanıt yetersizse varsayımla doldurma; uyarı bayrağı kaldır.
KONUM: teknoloji/otomobil/sağlık/yaşam/gastronomi/magazin → ulusal; TR il uydurma YASAK.
"orta/ortada", "genç", "keskin" günlük kelime ≠ Çankırı/Orta vb. "Bingöl'ün Genç ilçesinde" → Bingöl+Genç.
AA "ANKARA" dateline olay yeri değildir. Belirsizse city boş bırak.

Sen İspanya Dünya AI Editörü'sün, NaHaber Dünya masasının İspanya kolu.
Uzmanlık: İspanya.
- Ülke adını ve resmi kurumları doğru yaz; başka ülkeye sapma.
- "iddia edildi" düzeyini "oldu" yapma.
- Ulusal önemdeyse Dünya masasına (defne-aksoy) yükseltme bayrağı koy.
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.
```

**news**

```
GAZETE HABERİ yaz (ters piramit).
- 5N1K; en önemli bilgi ilk cümlede
- 250-450 kelime gövde (asgari ~220); doldurma yok; kaynak inceyse bile olgusal bağlam ekle
- Gövdede EN AZ 2, mümkünse 3-4 tane ## alt başlık ZORUNLU (yalnızca ~220 kelimelik en kısa haberlerde en az 1 yeterli)
- Alt başlıklar olay-özgü ve somut olsun (ör. "Bakanlıktan Açıklama", "Soruşturma Başlatıldı", "Vatandaşlar Ne Diyor"); jenerik ders kitabı başlığı ("Sonuç", "Giriş", "Gelişme", "Önemi", "Genel Değerlendirme" vb.) YASAK
- Her ## başlıktan sonra en az 1 dolu paragraf gelsin; başlığı yazıp boş bırakma
- Alt başlıkları markdown ## ile yaz, HTML etiketi kullanma
- Spot güçlü; content spot'u kopyalama
- HTML YASAK: <p>, </p>, <div>, <br>, <span> vb. ASLA yazma — yalnızca düz metin ve ## / ### markdown
- Paragrafları boş satırla ayır; etiket/kod gibi görünmesin
Üslup: İspanya odaklı uluslararası gazetecilik; ülke adı doğal; clickbait yok.
```

### Tam prompt — Aday B `ilce-canakkale-biga`

**core** — aynı GLOBAL_NEWSROOM_RULES + Biga persona:

```
Sen Biga (Çanakkale) AI Editörü'sün, NaHaber Çanakkale Biga ilçe masası.
Uzmanlık: Biga ilçesi.
Her haber: NEREDE? HANGİ İLÇE? HANGİ KURUM? NE OLDU? NE ZAMAN? KAYNAK?
- Biga dışındaki ilçeleri bu masaya zorlama.
- İl genelindeyse yerel-canakkale yükseltme bayrağı koy.
Sen bir AI editörsün; sahte insan kimliği / diploma uydurma.
```

**news** — SHARED_NEWS_STYLE + `Üslup: Biga yerel gazeteciliği; kurum adları doğru; "Biga'de şok" kalıbı yok.`

### Öneri (uygulanmadı)

**Aday A.** Mimari analiz ülke-geneli ilçeden önce önerir; `countrySlug` dunya haberinde zaten üretilir; Çanakkale/Antalya masa boşluğuyla çarpışmaz. Aday B, `districtSlug` çıkarımı yüzünden Çanakkale yerel trafiğine daha çabuk girer.

Sıra notu: A/B’den önce 20 şehir masasını **yalnızca create** (tam `seedDefaultAiEditors` değil) ayrı onay ister.

---

## TASK 3 — Flag aktivasyon checklist (flag açılmadı)

`EXPANDED_EDITOR_HIERARCHY_ENABLED=true` yalnızca env/`true`. Roster’a ülke/ilçe eklemez; yalnızca listede **zaten var** olan country/district doc’ları kullanır.

### (a) Etkilenen davranış

| Durum | Flag kapalı (şimdi) | Flag açık + kayıt yok | Flag açık + Aday A/B |
|---|---|---|---|
| 81 il / ulusal | aynı | aynı | aynı |
| 20 şehir masa | Firestore’da yok; kod yolu hazır | aynı | aynı |
| leftover `ulke-es` | **inert** (P1.2 filtre) | n/a | `countrySlug=es` → ulke-es |
| leftover Biga | **inert** | n/a | Biga+yerel → ilçe genel |

Regresyon riski (filtre **olmadan**): `ulke-es` `dunya` ile Defne’yi, Biga `yerel-haber` ile `yerel-canakkale`’yi flag kapalıyken çalardı. Filtre bunu kapatır.

### (b) Flag açıkken yeşil kalması gereken testler

- `seedCityCategoryEditors.test.ts`
- `aiEditorial.v2.test.ts` (Çanakkale spor → `yigit-anafarta` in-memory)
- `seedScaleEditors.p1_1.test.ts` (flag off spor; flag on zincir)
- `seedScaleEditors.p1_2.test.ts` (leftover isolation)

### (c) Rollback

1. Flag’i `false` yapmak **yeterli** — leftover routing’e girmez (P1.2 filtre).
2. Pilot doc’u silmek zorunlu değil; Admin’de görünür kalır, auto-route etmez.
3. İstersen `status: archived` veya doc delete + `users/{id}` + prompt’lar.
4. `refreshStylePromptsFromSeed` rollback aracı **değil**.

Açmadan önce: (1) 20 masa create kararı, (2) tek A veya B, (3) Vercel env + `[deploy]` ayrı onay, (4) health SHA ancestry.

---

## TASK 5 — İleriye dönük stil uyumu (kod yok)

`buildEditorPrompt` sırası: **aktif `core` + aktif task (`news`) + `NEWS_FORMAT_LOCK`**. Lock compose anında, Firestore `news` metninin **arkasına** eklenir; seed `news` içindeki SHARED_NEWS_STYLE’ı ezmez, üzerine biner.

Ayrıştırma:

- `core` = persona / konum disiplini (ülke veya ilçe kuyruğu burada).
- `news` = biçim + üslup cümlesi.
- `tone` / `editorialMission` / `temperature` zaten spec’te; DNA enjeksiyonu için boş slot.
- Admin karakter/tarz paneli `core`+`news` yazar, `changeReason: 'Admin karakter/tarz paneli'` — Defne’de kanıtlandı.
- Yeni `PERSONA STYLE OVERRIDE` bloğu **core sonuna** (NEWS_FORMAT_LOCK’tan önce) eklenebilir; lock ile çakışmaz.
- Override’ı lock’tan **sonra** koymak `promptBuilder` değişikliği ister — o fazın işi.
- P1.3 High-Engagement DNA ayrı dal; SCALE şablonuna gömülmedi; `refreshStylePromptsFromSeed` hâlâ dokunulmaz.

---

## Test

Önce (P1.1 sonu): 33 pass / 0 fail.  
Sonra: **37 pass / 0 fail**. Yeni FAIL: **0**.

---

## Eşzamanlı worktree

| Dal | SHA | |
|---|---|---|
| `cursor/ai-editor-scale-p1-1` | `6ccdf40` + P1.1/P1.2 uncommitted | bu faz |
| `cursor/ai-style-p1-3-preview` | `9097d34` | dokunulmadı |

---

**Açık soru:** Aday A mı, Aday B mi, ikisi de değil mi? (20 şehir masası create’i ayrı karar.)

**HUMAN DECISION REQUIRED.** Firestore’a ilk kayıt, flag açma, 20 masa seed, P1.3 birleşimi, deploy — bu rapordan otomatik başlamaz.
