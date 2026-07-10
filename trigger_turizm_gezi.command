#!/bin/bash

SECRET="5b729ac0e4bee32fca289d6f2e8c3317e1eafcdb952d7284dc2f8a682dea8779"

echo "🏖️  Turizm worker tetikleniyor..."
curl -s -X GET "https://www.nahaber.com/api/cron/newsroom/turizm" \
  -H "Authorization: Bearer $SECRET" \
  --max-time 120 | python3 -m json.tool 2>/dev/null || echo "(yanıt alındı)"

echo ""
echo "🗺️  Gezi worker tetikleniyor..."
curl -s -X GET "https://www.nahaber.com/api/cron/newsroom/gezi" \
  -H "Authorization: Bearer $SECRET" \
  --max-time 120 | python3 -m json.tool 2>/dev/null || echo "(yanıt alındı)"

echo ""
echo "✅ Tamamlandı!"
read -p "Kapatmak için Enter'a bas..."
