#!/bin/bash
# Queue'yu sıfırla ve son 12 saatin haberlerini yeniden çek
# Kullanım: dosyayı çift tıkla

BASE="https://nahaber.com"
TOKEN="5b729ac0e4bee32fca289d6f2e8c3317e1eafcdb952d7284dc2f8a682dea8779"

echo "============================================"
echo "  NaHaber Queue Sıfırlama & Yenileme"
echo "============================================"
echo ""

# ── 1. Eski queue itemlerini temizle ──────────────────────────────────────────
echo "▶ 1/3  Eski bekleyen itemler dead_letter yapılıyor (>12 saat eski)..."
PURGE=$(curl -sL -X POST "$BASE/api/admin/queue/purge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"olderThanHours": 12}')

echo "   Sonuç: $PURGE"
echo ""

# ── 2. Tüm büyük RSS cron'larını tetikle (admin trigger endpoint) ─────────────
echo "▶ 2/3  RSS kaynakları tetikleniyor (full-ingest)..."
INGEST=$(curl -sL -X POST "$BASE/api/admin/cron/trigger?job=full-ingest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --max-time 300)

echo "   Sonuç: $INGEST" | head -c 500
echo ""
echo ""

# ── 3. Sonuç ─────────────────────────────────────────────────────────────────
echo "============================================"
echo "  ✅ Tamamlandı!"
echo "  CMS > AI Newsroom'dan kontrol edebilirsiniz."
echo "============================================"
