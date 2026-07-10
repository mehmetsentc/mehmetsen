# Vercel Maliyet Raporu — Temmuz 2026

**Hesap:** Mehmet's projects (shenteam1) — Pro Plan  
**Dönem:** 12 Haz – 12 Tem 2026  
**Rapor tarihi:** 11 Temmuz 2026

---

## Aylık Toplam Fatura

| Kalem | Tutar |
|---|---|
| Pro Plan aboneliği | $20.00 |
| Speed Insights aboneliği | $10.00 |
| Kullanım aşımı (on-demand) | $19.13 |
| **TOPLAM** | **~$49.13 / ay** |

> Pro planın $20 dahili kredit hakkı tüm kullanıldı; $19.13 ek ücret kesildi.

---

## Kullanım Kalemi Dökümü

### 🔴 Kritik — En Büyük Harcamalar

| Kalem | Kullanım | Ücret |
|---|---|---|
| Build CPU Dakikaları | 140 saat (limit 100 saat) | **$12.01** |
| Observability Events | 3.41M olay | **$4.10** |
| Fluid Function Belleği | 617 GB·saat | **$9.24** |
| Fluid Function CPU | 33 saat | **$6.08** |
| Speed Insights abonelik | 1 lisans | **$10.00** |

### 🟡 Orta — Kontrol Edilebilir

| Kalem | Kullanım | Ücret |
|---|---|---|
| Image Optimization (dönüşüm) | 33.8K | $1.93 |
| Speed Insights veri noktası | 23.76K | $1.95 |
| ISR Writes | 262.76K | $1.34 |
| Image Cache Writes | 193.12K | $0.77 |
| Web Analytics Events | 17.05K | $0.51 |
| Fast Origin Transfer | 10 GB | $0.61 |
| Function Invocations | 801K | $0.48 |

### 🟢 Düşük — Sorun Yok

Fast Data Transfer 14 GB / 1 TB limiti, Edge Requests 1.05M / 10M limiti — ücrete girmedi.

---

## Sorunların Kökü: Ne Neden Pahalı?

### 1. Build dakikaları ($12/ay) — En Büyük Sorun

Pro plan 6.000 dakika (100 saat) build hakkı veriyor. 140 saat kullandınız, yani **40 saat aşım** = $12 ek.

**Neden?** Cursor IDE her küçük değişikliği ayrı commit yapıp push ediyor → Vercel her commit'te build başlatıyor. Bu ay ~20+ deploy görüldü ama Cursor büyük ihtimalle çok daha fazlasını yaptı. Ortalama her build'in ~7 dakika sürdüğü hesaplanıyor.

### 2. Serverless Function maliyeti ($15.32/ay)

Newsroom cron worker'ları (turizm, gezi, spor vb.) her 30-60 dakikada tetikleniyor. Her çalışmada AI API'si çağrısı + Firestore yazma yapıyorlar. "Fluid" (auto-scaling) modda çalışıyorlar — bu Vercel'in en pahalı function tipi.

### 3. Speed Insights aboneliği ($10 + $1.95 = $11.95/ay)

Core Web Vitals ölçümü yapıyor. Güzel bir özellik ama zorunlu değil. **Tek başına $12/ay** götürüyor.

### 4. Observability Events ($4.10/ay)

3.41 milyon log/izleme olayı. Uygulama büyüdükçe bu maliyet artıyor.

---

## Tasarruf Planı

### ⚡ Hemen Yapılabilecekler (Bu Ay ~$22 Tasarruf)

**A) Speed Insights'ı kapat → $12/ay tasarruf**

Vercel Dashboard → Settings → Billing → Speed Insights → Cancel add-on

Core Web Vitals için ücretsiz alternatifler var: Google PageSpeed Insights, Lighthouse CI.

**B) Build sıklığını azalt → $10-12/ay tasarruf**

- Cursor'da auto-commit yerine "büyük değişiklikler tamamlandığında commit et" alışkanlığı
- Ya da Vercel'de "Ignored Build Step" ayarı — belirli branch'leri ya da dosya değişimlerini deploy etme:

```bash
# vercel.json'a ekle:
{
  "ignoreCommand": "git diff HEAD~1 --name-only | grep -vE '\\.(ts|tsx|css|json)$'"
}
```

Veya sadece `main` branch'ten deploy açık bırakıp preview deploy'ları kapat.

**C) Observability'i kapat → $4/ay tasarruf**

Vercel Dashboard → Project → Settings → Observability → Disable

---

### 🔧 Orta Vadeli (Önümüzdeki 1-2 Ay ~$10 Ek Tasarruf)

**D) Cron worker'larını optimize et → $5-8/ay tasarruf**

- Worker'ların çalışma süresini kısalt (AI yanıtı beklerken timeout'u düşür)
- Gereksiz sık çalışan worker'ları azalt (her 30dk → her 2 saatte bir)
- Edge Runtime'a geçilirse bellek maliyeti düşer

**E) ISR / Image Optimization'ı düzelt → $3-4/ay tasarruf**

ISR Writes 262K — çok yüksek. Sayfalar çok sık revalidate ediliyor:
```typescript
// next.config.ts — revalidate süresini artır
export const revalidate = 3600  // 1 saat (şu an muhtemelen 60sn veya daha az)
```

Image Optimization için cache süresi uzat:
```typescript
// next.config.ts
images: {
  minimumCacheTTL: 86400,  // 24 saat (varsayılan çok kısa)
}
```

---

## Senaryo Karşılaştırması

| Senaryo | Aylık Maliyet |
|---|---|
| Şu an (optimize edilmemiş) | ~$49 |
| Hızlı önlemler (A+B+C) | ~$27 |
| Tam optimizasyon (A+B+C+D+E) | ~$17 |
| Theoretical minimum (Pro plan limiti dahilinde) | $20 |

---

## Alternatiflere Göz Atalım mı?

Vercel Pro $20/ay zorunlu (ticari site için Hobby kullanılamaz). Ama **hybrid** bir yaklaşım mümkün:

- **Cloudflare Pages** — Next.js'i deploy eder, ücretsiz tier çok cömert (500 build/ay, unlimited bandwidth). Cron worker'ları için Cloudflare Workers $5/ay.
- **Railway** — Serverless değil, container tabanlı. $5/ay'dan başlar, build dakikası kavramı yok.

Ancak Vercel'den göç etmek ciddi efor gerektirir. Önce yukarıdaki optimizasyonları uygulamak daha mantıklı.

---

## Öncelik Sırası

1. **Speed Insights'ı kapat** (5 dakika, $12 tasarruf)
2. **Observability'i kapat** (2 dakika, $4 tasarruf)  
3. **Preview deployment'ları kısıtla** (10 dakika, $10-12 tasarruf)
4. **ISR revalidate süresini uzat** (30 dakika kod, $3-4 tasarruf)
5. **Cron worker sıklığını azalt** (1 saat kod, $5-8 tasarruf)

**Hedef: $49 → $17-20/ay** — yani masrafların %60'ını kesmek.
