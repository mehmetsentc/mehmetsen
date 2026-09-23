# FAZ AI-EDITOR-SCALE P2.2 — deploy raporu

Tarih: 23 Eylül 2026

## TASK 1 — Senkron

Merge öncesi origin NZhLO hâlâ `46816361a701deb1cf14b496b94c1a75df96ba56`. Kesişim analizi tekrarlanmadı.

## TASK 2 — Merge

- İzole dal: `cursor/ai-editor-scale-p2-reconcile`
- Merge: `7f27110` (e950a6a onto 4681636, conflict yok)
- Deploy commit: `711a8c5` empty `[force-deploy]`
- Fast-forward: `4681636..711a8c5` → `claude/nahabber-project-architecture-NZhLO`
- PR: https://github.com/mehmetsentc/mehmetsen/pull/16 (**MERGED**)
- `cursor/ai-editor-scale-p1-1` ezilmedi (`d9d7e04`)

## TASK 3 — Deploy yöntemi

`npm run deploy:batch` → **3/2 kapalı** (git-log; Vercel READY bugün İstanbul: `6ccdf40` 16:02, `eed5733` 17:39, `4681636` 20:42).

**Kullanılan etiket: `[force-deploy]`** — günlük slot dolu, SCALE kodu production’da değildi, talimat force’a izin verdi.

| | |
|---|---|
| Production SHA | `711a8c5` |
| Deploy ID | `dpl_79sxj3MUC6iVrBpVMagm1p35nYiU` |
| Durum | **READY** (`ready` 23 Eyl 2026 ~21:11 TRT) |
| Inspector | https://vercel.com/shenteam1/nahaber/79sxj3MUC6iVrBpVMagm1p35nYiU |
| Alias | `www.nahaber.com` (production) |
| Rollback | `dpl_E9KcdcPw36xq8EBatjmf8Rf3DndF` (`4681636`) |

## TASK 4 — İlk izleme (deploy + birkaç dk)

Firestore GET (`scripts/_ai_editor_scale_p2_2_watch.ts`):

| | |
|---|---|
| `aiEditors` | 2015 |
| Circuit | `tripped=false` (Wave 3 snapshot; quality sample 0) |
| Son ~3s usage | 52 event, 2 hata → **%3.8** (eşik %30, n≥20) |
| `ulke-ispanya` | `scaleHardened`, `REQUIRES_APPROVAL`, `maxDailyNews=3`, consecutive=0 / 20 |
| `ilce-canakkale-biga` / `il-bursa-spor` / `yigit-anafarta` | aynı kilit profili |
| `defne-aksoy` | **kilitlenmedi** (`scaleHardened=false`, `AUTO_PUBLISH`, 40) |

Yeni masalardan henüz üretim yok (`scaleDailyNewsCount=0`). Anormallik yok.

Vercel runtime log/error API bu token ile **403** — ilk 2–3 saati panelden veya aynı watch script ile tekrarlamak gerekir.

## Flag / ilk müdahale

`EXPANDED_EDITOR_HIERARCHY_ENABLED=true` duruyor (production + preview + development). Routing canlı.

Sorun olursa sıra:

1. Flag’i `false` yap (expanded ilçe/ülke zinciri kapanır; city desk’ler kalır) — rollback’ten hızlı.
2. Instant rollback: `dpl_E9KcdcPw36xq8EBatjmf8Rf3DndF`.
