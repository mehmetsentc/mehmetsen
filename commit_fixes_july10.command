#!/bin/bash
cd "$(dirname "$0")"

rm -f .git/index.lock

git add \
  src/app/api/analytics/vitals/route.ts \
  src/services/newsroom/scraperPublishHelper.ts \
  src/services/newsroom/workers/ankaLocalWorker.ts \
  src/components/admin/AdminNewsEditor.tsx

git status --short

git commit -m "fix: 3 hata düzeltmesi — vitals Firestore path + forcedCity undefined + AdminNewsEditor şehir/ilçe

fix(analytics/vitals): sanitizeRoute başındaki / karakterini siler
  - Önceki: /haber/slug → Firestore'da tek segmentli yol → INVALID_ARGUMENT (577 hata)
  - Sonrası: home / haber__slug formatında temiz doc ID

fix(scraperPublishHelper): pipelineInput'ta undefined alanlar Firestore'a yazılmıyordu
  - forcedCity/forcedCitySlug/isBreaking/priorityScore undefined olunca conditional spread ile atlanır
  - aa-content ve diğer cronjob'larda 'Cannot use undefined as Firestore value' hatası giderildi

fix(ankaLocalWorker): detectedCity ?? undefined → conditional spread
  - null/undefined durumda forcedCity hiç eklenmez

feat(AdminNewsEditor): şehir+ilçe desteği tüm kategorilere genişletildi
  - districtSlug state + getDistrictsForProvince import eklendi
  - Şehir dropdown artık tüm kategorilerde görünür (isteğe bağlı)
  - Şehir seçilince ilgili ilçe dropdown'u açılır
  - Payload: citySlug/city/districtSlug tüm kategorilerde gönderilir"

git push origin claude/nahabber-project-architecture-NZhLO

echo ""
echo "✅ Push tamamlandı — Vercel deploy başlıyor."
echo ""
echo "Düzeltilen hatalar:"
echo "  • analytics/vitals: 577 Firestore path hatası giderildi"
echo "  • scraperPublishHelper: aa-content forcedCity undefined hatası giderildi"
echo "  • AdminNewsEditor: şehir+ilçe seçimi tüm kategorilerde"
read -p "Kapatmak için Enter'a bas..."
