# NaHaber — Mimari & Proje Planı

## Genel Bakış

**NaHaber**, Next.js App Router tabanlı, Firebase destekli sosyal medya + haber platformudur.
Kullanıcılar haber paylaşabilir, beğenebilir, yorum yapabilir, birbirini takip edebilir ve içerik kaydedebilir.

---

## 1. Teknoloji Stack

| Katman           | Teknoloji                          |
|------------------|------------------------------------|
| Framework        | Next.js 15 (App Router)            |
| Dil              | TypeScript                         |
| Stil             | Tailwind CSS + shadcn/ui           |
| Kimlik Doğrulama | Firebase Auth                      |
| Veritabanı       | Cloud Firestore                    |
| Medya Depolama   | Firebase Storage                   |
| Durum Yönetimi   | Zustand                            |
| Form Yönetimi    | React Hook Form + Zod              |
| Görsel Yükleme   | react-dropzone                     |
| Bildirimler      | react-hot-toast                    |
| Tarih Formatlama | date-fns                           |
| İkonlar          | lucide-react                       |

---

## 2. Klasör Yapısı

```
nahaber/
├── public/
│   ├── icons/              # PWA ve favicon ikonları
│   └── images/             # Statik görseller (logo, placeholder)
├── src/
│   ├── app/                # Next.js App Router sayfaları
│   │   ├── (auth)/         # Route grubu: kimlik doğrulama sayfaları
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── layout.tsx  # Auth layout (centered card)
│   │   ├── (main)/         # Route grubu: ana uygulama sayfaları
│   │   │   ├── feed/       # Ana haber akışı
│   │   │   ├── post/
│   │   │   │   ├── [id]/   # Haber detay sayfası
│   │   │   │   └── create/ # Haber oluşturma
│   │   │   ├── profile/
│   │   │   │   └── [username]/  # Kullanıcı profili
│   │   │   ├── saved/      # Kaydedilen haberler
│   │   │   ├── search/     # Arama sayfası
│   │   │   ├── notifications/  # Bildirimler
│   │   │   └── layout.tsx  # Sidebar + Navbar içeren ana layout
│   │   ├── admin/          # Admin paneli (korumalı)
│   │   │   ├── dashboard/  # İstatistikler
│   │   │   ├── users/      # Kullanıcı yönetimi
│   │   │   ├── posts/      # İçerik yönetimi
│   │   │   ├── reports/    # Şikayet yönetimi
│   │   │   ├── categories/ # Kategori yönetimi
│   │   │   └── layout.tsx  # Admin sidebar layout
│   │   ├── api/            # Next.js API route'ları
│   │   │   ├── auth/       # Auth callback endpoints
│   │   │   └── upload/     # Medya yükleme endpoint
│   │   ├── layout.tsx      # Root layout (font, metadata, providers)
│   │   ├── page.tsx        # Landing/redirect sayfası
│   │   ├── loading.tsx     # Global loading UI
│   │   ├── error.tsx       # Global error boundary
│   │   └── not-found.tsx   # 404 sayfası
│   │
│   ├── components/         # Yeniden kullanılabilir bileşenler
│   │   ├── auth/           # Login, Register form bileşenleri
│   │   ├── feed/           # FeedList, PostCard, FeedFilters
│   │   ├── post/           # PostDetail, PostEditor, LikeButton, SaveButton
│   │   ├── comments/       # CommentList, CommentItem, CommentForm
│   │   ├── profile/        # ProfileHeader, ProfileTabs, FollowButton
│   │   ├── admin/          # AdminSidebar, StatsCard, UserTable
│   │   ├── layout/         # Navbar, Sidebar, MobileNav, Footer
│   │   └── ui/             # Temel UI primitives (Button, Input, Modal, Avatar...)
│   │
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.ts      # Oturum durumu
│   │   ├── usePosts.ts     # Post CRUD + real-time listener
│   │   ├── useComments.ts  # Yorum işlemleri
│   │   ├── useLike.ts      # Beğeni toggle
│   │   ├── useSave.ts      # Kaydetme toggle
│   │   ├── useFollow.ts    # Takip toggle
│   │   ├── useUpload.ts    # Firebase Storage yükleme
│   │   └── useInfiniteScroll.ts  # Pagination / infinite scroll
│   │
│   ├── lib/                # Yapılandırma ve yardımcı fonksiyonlar
│   │   ├── firebase/
│   │   │   ├── config.ts   # Firebase app başlatma
│   │   │   ├── auth.ts     # Auth instance export
│   │   │   ├── firestore.ts # Firestore instance + helper refs
│   │   │   └── storage.ts  # Storage instance export
│   │   ├── validators/
│   │   │   ├── auth.ts     # Zod şemaları: login, register
│   │   │   └── post.ts     # Zod şemaları: post oluşturma
│   │   └── utils.ts        # Genel yardımcı fonksiyonlar
│   │
│   ├── services/           # Firestore işlem katmanı (iş mantığı)
│   │   ├── authService.ts  # Kayıt, giriş, çıkış, profil güncelleme
│   │   ├── postService.ts  # Post CRUD, sayfalama, filtreleme
│   │   ├── commentService.ts # Yorum CRUD
│   │   ├── likeService.ts  # Beğeni ekleme/kaldırma
│   │   ├── saveService.ts  # Kaydetme ekleme/kaldırma
│   │   ├── followService.ts # Takip etme/bırakma
│   │   ├── userService.ts  # Kullanıcı sorgulama, güncelleme
│   │   ├── storageService.ts # Dosya yükleme/silme
│   │   └── adminService.ts # Admin işlemleri, raporlar
│   │
│   ├── store/              # Zustand global state
│   │   ├── authStore.ts    # Kullanıcı oturum state'i
│   │   ├── feedStore.ts    # Feed filtreleri, pagination state
│   │   └── uiStore.ts      # Modal, sidebar, toast state
│   │
│   ├── types/              # TypeScript tip tanımları
│   │   ├── user.ts         # User, UserProfile
│   │   ├── post.ts         # Post, PostWithAuthor
│   │   ├── comment.ts      # Comment
│   │   └── common.ts       # Pagination, ApiResponse, MediaItem
│   │
│   └── constants/          # Sabit değerler
│       ├── routes.ts       # Route sabitleri (ROUTES.FEED, vs.)
│       └── config.ts       # Max dosya boyutu, kategori listesi, vs.
```

---

## 3. Gerekli NPM Paketleri

### Production Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0",

    "firebase": "^11.0.0",

    "tailwindcss": "^3.4.0",
    "@tailwindcss/typography": "^0.5.15",

    "zustand": "^5.0.0",

    "react-hook-form": "^7.54.0",
    "zod": "^3.24.0",
    "@hookform/resolvers": "^3.9.0",

    "react-dropzone": "^14.3.0",
    "react-hot-toast": "^2.4.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.468.0",

    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5"
  }
}
```

### Dev Dependencies

```json
{
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.4.0",
    "prettier-plugin-tailwindcss": "^0.6.9"
  }
}
```

---

## 4. Kurulum Komutları

```bash
# 1. Next.js projesi oluştur
npx create-next-app@latest nahaber \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd nahaber

# 2. Firebase SDK
npm install firebase

# 3. State yönetimi
npm install zustand

# 4. Form + validasyon
npm install react-hook-form zod @hookform/resolvers

# 5. UI yardımcıları
npm install react-dropzone react-hot-toast date-fns lucide-react

# 6. Tailwind yardımcıları
npm install clsx tailwind-merge
npm install -D @tailwindcss/typography prettier prettier-plugin-tailwindcss

# 7. shadcn/ui başlatma (opsiyonel ama önerilir)
npx shadcn@latest init
```

---

## 5. .env.local Değişkenleri

```env
# Firebase Proje Yapılandırması
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Uygulama
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=NaHaber

# Firebase Admin (server-side işlemler için)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> **Not:** `NEXT_PUBLIC_` öneki olan değişkenler tarayıcıya açılır. Admin değişkenleri sadece server-side kullanılır.

---

## 6. Firebase Console'da Aktif Edilmesi Gereken Servisler

| Servis                   | Kullanım Amacı                               |
|--------------------------|----------------------------------------------|
| **Authentication**       | Email/Şifre, Google Sign-In                  |
| **Cloud Firestore**      | Ana veritabanı (koleksiyonlar)               |
| **Firebase Storage**     | Görsel ve video yükleme                      |
| **Firebase Analytics**   | Kullanıcı davranış takibi (opsiyonel)        |

### Authentication Providers

Firebase Console → Authentication → Sign-in method:
- ✅ Email/Password
- ✅ Google

### Firestore Security Rules (Başlangıç)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Kullanıcılar sadece kendi profilini güncelleyebilir
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    // Postlar: okuma herkese açık, yazma giriş yapanlar
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.authorId;
    }

    // Yorumlar
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.authorId;
    }

    // Beğeniler, Kaydedilenler, Takipler
    match /likes/{likeId} {
      allow read, write: if request.auth != null;
    }
    match /saves/{saveId} {
      allow read, write: if request.auth != null;
    }
    match /follows/{followId} {
      allow read, write: if request.auth != null;
    }

    // Raporlar
    match /reports/{reportId} {
      allow create: if request.auth != null;
      allow read, update: if false; // sadece Admin SDK ile
    }

    // Kategoriler: sadece okuma
    match /categories/{categoryId} {
      allow read: if true;
      allow write: if false; // sadece Admin SDK ile
    }
  }
}
```

### Storage Security Rules (Başlangıç)

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Kullanıcı avatarları
    match /avatars/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth.uid == userId
                   && request.resource.size < 2 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
    // Post medya dosyaları
    match /posts/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth.uid == userId
                   && request.resource.size < 50 * 1024 * 1024;
    }
  }
}
```

---

## 7. Firestore Koleksiyon Yapısı

### `users` Koleksiyonu

```
users/{userId}
```

```json
{
  "uid": "firebase_auth_uid",
  "username": "ahmet_yilmaz",
  "displayName": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "photoURL": "https://storage.../avatars/uid/avatar.jpg",
  "bio": "Teknoloji habercisi",
  "website": "https://ahmetyilmaz.com",
  "location": "İstanbul, Türkiye",
  "role": "user",
  "isVerified": false,
  "isBlocked": false,
  "followersCount": 142,
  "followingCount": 87,
  "postsCount": 23,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-06-01T14:20:00Z"
}
```

> `role`: `"user"` | `"moderator"` | `"admin"`

---

### `posts` Koleksiyonu

```
posts/{postId}
```

```json
{
  "id": "auto_generated_id",
  "title": "Türkiye'de Yapay Zeka Yatırımları Rekor Kırdı",
  "slug": "turkiyede-yapay-zeka-yatirimlari-rekor-kirdi",
  "content": "Haber içeriği markdown formatında...",
  "summary": "Kısa özet metni (maks. 200 karakter)",
  "authorId": "firebase_auth_uid",
  "authorUsername": "ahmet_yilmaz",
  "categoryId": "teknoloji",
  "tags": ["yapay-zeka", "yatırım", "türkiye"],
  "mediaItems": [
    {
      "type": "image",
      "url": "https://storage.../posts/uid/img1.jpg",
      "thumbnailUrl": "https://storage.../posts/uid/img1_thumb.jpg",
      "caption": "Konferans salonu görüntüsü"
    }
  ],
  "coverImageUrl": "https://storage.../posts/uid/cover.jpg",
  "status": "published",
  "visibility": "public",
  "likesCount": 48,
  "commentsCount": 12,
  "savesCount": 7,
  "viewsCount": 320,
  "isEditorPick": false,
  "isTrending": false,
  "publishedAt": "2024-06-01T09:00:00Z",
  "createdAt": "2024-06-01T08:45:00Z",
  "updatedAt": "2024-06-01T09:00:00Z"
}
```

> `status`: `"draft"` | `"published"` | `"archived"` | `"banned"`  
> `visibility`: `"public"` | `"followers"` | `"private"`

---

### `comments` Koleksiyonu

```
comments/{commentId}
```

```json
{
  "id": "auto_generated_id",
  "postId": "post_id",
  "parentId": null,
  "authorId": "firebase_auth_uid",
  "authorUsername": "mehmet_can",
  "authorPhotoURL": "https://storage.../avatars/uid/avatar.jpg",
  "content": "Harika bir haber, teşekkürler!",
  "likesCount": 3,
  "repliesCount": 1,
  "isEdited": false,
  "isDeleted": false,
  "createdAt": "2024-06-01T10:00:00Z",
  "updatedAt": "2024-06-01T10:00:00Z"
}
```

> `parentId`: null ise ana yorum, dolu ise yanıt (nested yorum)

---

### `likes` Koleksiyonu

```
likes/{likeId}
```

```json
{
  "id": "{userId}_{targetId}",
  "userId": "firebase_auth_uid",
  "targetId": "post_id_veya_comment_id",
  "targetType": "post",
  "createdAt": "2024-06-01T11:00:00Z"
}
```

> `targetType`: `"post"` | `"comment"`  
> `id` pattern'i `{userId}_{targetId}` olarak ayarlanırsa duplicate önlenir.

---

### `saves` Koleksiyonu

```
saves/{saveId}
```

```json
{
  "id": "{userId}_{postId}",
  "userId": "firebase_auth_uid",
  "postId": "post_id",
  "createdAt": "2024-06-01T11:30:00Z"
}
```

---

### `follows` Koleksiyonu

```
follows/{followId}
```

```json
{
  "id": "{followerId}_{followingId}",
  "followerId": "firebase_auth_uid",
  "followingId": "hedef_kullanici_uid",
  "createdAt": "2024-06-01T12:00:00Z"
}
```

---

### `categories` Koleksiyonu

```
categories/{categoryId}
```

```json
{
  "id": "teknoloji",
  "name": "Teknoloji",
  "slug": "teknoloji",
  "description": "Teknoloji dünyasından haberler",
  "iconName": "cpu",
  "color": "#3B82F6",
  "order": 1,
  "isActive": true,
  "postsCount": 156,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

### `reports` Koleksiyonu

```
reports/{reportId}
```

```json
{
  "id": "auto_generated_id",
  "reporterId": "firebase_auth_uid",
  "targetId": "post_id_veya_comment_id_veya_user_id",
  "targetType": "post",
  "reason": "spam",
  "description": "Bu içerik yanıltıcı bilgi içeriyor.",
  "status": "pending",
  "reviewedBy": null,
  "reviewedAt": null,
  "action": null,
  "createdAt": "2024-06-01T13:00:00Z"
}
```

> `targetType`: `"post"` | `"comment"` | `"user"`  
> `reason`: `"spam"` | `"hate_speech"` | `"misinformation"` | `"violence"` | `"other"`  
> `status`: `"pending"` | `"reviewed"` | `"dismissed"`  
> `action`: `"banned"` | `"warned"` | `"deleted"` | null

---

## 8. Uygulama Sayfaları ve Route Yapısı

| Route                            | Sayfa                    | Erişim          |
|----------------------------------|--------------------------|-----------------|
| `/`                              | Landing / Feed yönlendirme | Herkese açık  |
| `/login`                         | Giriş yap                | Misafir         |
| `/register`                      | Kayıt ol                 | Misafir         |
| `/feed`                          | Ana haber akışı          | Giriş yapanlar  |
| `/post/create`                   | Haber oluştur            | Giriş yapanlar  |
| `/post/[id]`                     | Haber detayı             | Herkese açık    |
| `/post/[id]/edit`                | Haber düzenle            | Yazar / Admin   |
| `/profile/[username]`            | Kullanıcı profili        | Herkese açık    |
| `/saved`                         | Kayıtlı haberler         | Giriş yapanlar  |
| `/search`                        | Arama                    | Herkese açık    |
| `/notifications`                 | Bildirimler              | Giriş yapanlar  |
| `/admin/dashboard`               | Admin: Özet              | Admin           |
| `/admin/users`                   | Admin: Kullanıcılar      | Admin           |
| `/admin/posts`                   | Admin: İçerikler         | Admin           |
| `/admin/reports`                 | Admin: Şikayetler        | Admin/Moderator |
| `/admin/categories`              | Admin: Kategoriler       | Admin           |

---

## 9. Sonraki Aşamada Kodlanacak Dosyalar (Öncelik Sırası)

### Aşama 1 — Temel Altyapı
1. `src/lib/firebase/config.ts` — Firebase başlatma
2. `src/lib/firebase/auth.ts` — Auth instance
3. `src/lib/firebase/firestore.ts` — Firestore + koleksiyon referansları
4. `src/lib/firebase/storage.ts` — Storage instance
5. `src/types/user.ts`, `post.ts`, `comment.ts`, `common.ts` — Tüm tipler
6. `src/constants/routes.ts`, `config.ts` — Sabit değerler
7. `src/lib/utils.ts` — cn(), formatDate(), truncate() yardımcıları

### Aşama 2 — Auth Sistemi
8. `src/store/authStore.ts` — Zustand auth store
9. `src/services/authService.ts` — Kayıt, giriş, çıkış, profil
10. `src/hooks/useAuth.ts` — Auth hook
11. `src/app/layout.tsx` — Root layout + AuthProvider
12. `src/app/(auth)/layout.tsx` — Auth layout
13. `src/app/(auth)/login/page.tsx` — Login sayfası
14. `src/app/(auth)/register/page.tsx` — Register sayfası
15. `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`

### Aşama 3 — Ana Layout & Feed
16. `src/app/(main)/layout.tsx` — Sidebar + Navbar layout
17. `src/components/layout/Navbar.tsx`
18. `src/components/layout/Sidebar.tsx`
19. `src/components/layout/MobileNav.tsx`
20. `src/services/postService.ts` — Post CRUD
21. `src/hooks/usePosts.ts` — Post hook + real-time
22. `src/app/(main)/feed/page.tsx` — Feed sayfası
23. `src/components/feed/PostCard.tsx`
24. `src/components/feed/FeedList.tsx`

### Aşama 4 — Post Detay & Oluşturma
25. `src/app/(main)/post/[id]/page.tsx` — Post detay
26. `src/app/(main)/post/create/page.tsx` — Post oluşturma
27. `src/components/post/PostEditor.tsx`
28. `src/components/post/MediaUploader.tsx`
29. `src/services/storageService.ts` — Dosya yükleme
30. `src/hooks/useUpload.ts`

### Aşama 5 — Sosyal Özellikler
31. `src/services/likeService.ts` + `hooks/useLike.ts`
32. `src/services/saveService.ts` + `hooks/useSave.ts`
33. `src/services/commentService.ts` + `hooks/useComments.ts`
34. `src/services/followService.ts` + `hooks/useFollow.ts`
35. `src/components/post/LikeButton.tsx`, `SaveButton.tsx`
36. `src/components/comments/CommentList.tsx`, `CommentForm.tsx`

### Aşama 6 — Profil & Arama
37. `src/app/(main)/profile/[username]/page.tsx`
38. `src/components/profile/ProfileHeader.tsx`, `ProfileTabs.tsx`
39. `src/app/(main)/search/page.tsx`
40. `src/app/(main)/saved/page.tsx`

### Aşama 7 — Admin Paneli
41. `src/app/admin/layout.tsx` — Admin korumalı layout
42. `src/app/admin/dashboard/page.tsx`
43. `src/services/adminService.ts`
44. `src/components/admin/UserTable.tsx`, `ReportsTable.tsx`

---

## 10. Firestore İndeksleri (firestore.indexes.json)

```json
{
  "indexes": [
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "publishedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "publishedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "authorId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "comments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "postId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "follows",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "followerId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 11. Genel Mimari Kararlar

| Karar                          | Tercih & Gerekçe                                              |
|--------------------------------|----------------------------------------------------------------|
| Route grupları `(auth)/(main)` | Layout paylaşımı için, URL'yi etkilemez                       |
| Service katmanı                | Component'lar Firestore'u doğrudan çağırmaz, service üzerinden gider |
| Zustand (Redux yerine)         | Daha az boilerplate, Next.js ile uyumlu                       |
| Compound ID (likes/saves)      | `{userId}_{targetId}` → duplicate önler, getDoc ile hızlı okuma |
| Denormalizasyon                | `authorUsername` post'ta tutulur → join sorgusu gerekmez      |
| Counter alanları               | `likesCount`, `commentsCount` → aggregate query yapmak yerine okuma |
| Slug alanı                     | SEO için post URL'de ID yerine slug kullanılabilir            |
