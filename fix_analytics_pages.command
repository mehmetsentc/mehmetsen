#!/bin/bash
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null

git add src/app/api/analytics/track/route.ts

git commit -m "fix: analytics/track — set({merge}) → update() ile dot-notation bug [deploy]

Sorun: Admin SDK'da set({ merge: true }) ile 'pages.home' gibi noktalı
anahtarlar HARFÎ field adı olarak saklanıyor (gerçek bir nokta içerek),
iç içe map oluşturmuyor. Bu yüzden d?.pages her zaman undefined dönüyor
ve topPages boş görünüyordu. total alanı ise nokta içermediğinden 2590
olarak düzgün görünüyordu.

Düzeltme: update() kullan (noktalı yolları doğru çözer).
Belge yoksa (günün ilk isteği) NOT_FOUND yakalanır, set() ile oluşturulur."

git push
echo "✅ Push tamamlandı."
