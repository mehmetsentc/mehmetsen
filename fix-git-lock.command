#!/bin/bash
rm -f /Users/user/nahaber/.git/index.lock
cd /Users/user/nahaber
git add src/services/newsroom/aiCategoryClassifier.ts src/services/newsroom/breakingNewsEditor.ts src/services/newsroom/workers/ankaBreakingWorker.ts
git commit -m "fix: son-dakika filtresi — yerel/belediye haber sızması engellendi

- ankaBreakingWorker: gundem TRULY_BREAKING_CATEGORIES'den çıkarıldı
- ankaBreakingWorker: gundem için GUNDEM_BREAKING_KEYWORDS acil keyword kontrolü eklendi
- ankaBreakingWorker: AI null/hata fallback son-dakika yerine gundem/yerel-haber'e düşürüldü
- aiCategoryClassifier: gundem açıklamasından belediye/yerel yönetim kaldırıldı
- aiCategoryClassifier: yerel-haber açıklamasına belediye/zabıta/karne örnekleri eklendi
- breakingNewsEditor: LOCAL_BLOCKING_TERMS genişletildi (karne, mezuniyet, dolandırıcılık vb.)"
git push
echo "✅ Push tamamlandı. Bu pencereyi kapatabilirsiniz."
