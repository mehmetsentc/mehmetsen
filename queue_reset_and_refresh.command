#!/bin/bash
# Queue'yu sıfırla ve son 12 saatin haberlerini yeniden çek
# Kullanım: dosyayı çift tıkla

BASE="https://nahaber.com"
TOKEN="5b729ac0e4bee32fca289d6f2e8c3317e1eafcdb952d7284dc2f8a682dea8779"
CRON_SECRET="${CRON_SECRET:-}"

echo "============================================"
echo "  NaHaber Queue Sıfırlama & Yenileme"
echo "============================================"
echo ""

# ── 1. Eski queue itemlerini temizle ──────────────────────────────────────────
echo "▶ 1/3  Eski bekleyen itemler dead_letter yapılıyor (>12 saat eski)..."
PURGE=$(curl -s -X POST "$BASE/api/admin/queue/purge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"olderThanHours": 12}')

echo "   Sonuç: $PURGE"
echo ""

# ── 2. Tüm büyük RSS cron'larını tetikle ─────────────────────────────────────
echo "▶ 2/3  RSS kaynakları tetikleniyor..."

trigger_cron() {
  local name="$1"
  local path="$2"
  echo -n "   → $name ... "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE$path" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-cron-secret: $TOKEN" \
    --max-time 30)
  echo "HTTP $STATUS"
}

trigger_cron "breaking"          "/api/cron/newsroom/breaking"
trigger_cron "gundem"            "/api/cron/newsroom/gundem"
trigger_cron "anka-breaking"     "/api/cron/newsroom/anka-breaking"
trigger_cron "sozcu-breaking"    "/api/cron/newsroom/sozcu-breaking"
trigger_cron "national"          "/api/cron/newsroom/national"
trigger_cron "local"             "/api/cron/newsroom/local"
trigger_cron "world"             "/api/cron/newsroom/world"
trigger_cron "sports"            "/api/cron/newsroom/sports"
trigger_cron "technology"        "/api/cron/newsroom/technology"
trigger_cron "finans"            "/api/cron/newsroom/finans"
trigger_cron "health"            "/api/cron/newsroom/health"
trigger_cron "aa-content"        "/api/cron/newsroom/aa-content"
trigger_cron "kibris"            "/api/cron/newsroom/kibris"
trigger_cron "freenews"          "/api/cron/newsroom/freenews"
trigger_cron "politics"          "/api/cron/newsroom/politics"

echo ""

# ── 3. Process-queue'yu çalıştır ─────────────────────────────────────────────
echo "▶ 3/3  Process-queue başlatılıyor (yeni itemleri AI ile işle)..."
PROC=$(curl -s -X POST "$BASE/api/cron/newsroom/process-queue" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-cron-secret: $TOKEN" \
  --max-time 60)
echo "   Sonuç: $PROC"
echo ""

echo "============================================"
echo "  ✅ Tamamlandı! Queue temizlendi ve"
echo "     yeni haberler sıraya alındı."
echo "  CMS > AI Newsroom'dan kontrol edebilirsiniz."
echo "============================================"
