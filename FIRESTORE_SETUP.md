# Firestore Setup & Security Rules

## Firestore Database Oluşturma

### Adım 1: Firebase Console'de Database Oluştur
1. [Firebase Console](https://console.firebase.google.com) açın
2. "NaHaber" projesini seçin
3. Sol menüde **"Firestore Database"** seçin
4. **"Create Database"** butonuna tıklayın
5. Seçenekler:
   - **Location:** En yakın bölgeyi seçin (örn: `europe-west1`)
   - **Security Rules:** "Start in production mode" seçin
6. **"Create"** butonuna tıklayın

---

## Security Rules

Kaynak: `firestore.rules` (repo kökü). Deploy:

```bash
npx firebase-tools deploy --only firestore:rules --project nahaberapp
```

Manuel yapıştırma: **Firebase Console → Firestore Database → Rules**

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isSignedIn() {
      return request.auth != null;
    }
    
    function isUser(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    function isAdmin() {
      return isSignedIn() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    function isAuthor(authorId) {
      return isSignedIn() && request.auth.uid == authorId;
    }
    
    // ========== USERS COLLECTION ==========
    match /users/{userId} {
      // Herkes oku (herkese açık profil)
      allow read: if true;
      
      // Sadece kendi profili yazı (veya admin)
      allow write: if isUser(userId) || isAdmin();
      
      // User creation during registration
      allow create: if request.auth.uid == userId &&
                       request.resource.data.email == request.auth.token.email;
      
      // User update (only by user or admin)
      allow update: if isUser(userId) || isAdmin();
      
      // Delete (only admin)
      allow delete: if isAdmin();
    }
    
    // ========== POSTS COLLECTION ==========
    match /posts/{postId} {
      // Herkese oku
      allow read: if true;
      
      // Yalnız kayıtlı kullanıcılar oluşturabilir
      allow create: if isSignedIn() &&
                       request.resource.data.authorId == request.auth.uid &&
                       request.resource.data.status in ['draft', 'published'];
      
      // Yalnız yazar veya admin güncelleyebilir
      allow update: if isAuthor(resource.data.authorId) || isAdmin();
      
      // Yalnız yazar veya admin silebilir
      allow delete: if isAuthor(resource.data.authorId) || isAdmin();
      
      // Subcollection: comments
      match /comments/{commentId} {
        allow read: if true;
        allow create: if isSignedIn() &&
                         request.resource.data.userId == request.auth.uid;
        allow update: if isUser(resource.data.userId) || isAdmin();
        allow delete: if isUser(resource.data.userId) || isAdmin();
      }
      
      // Subcollection: likes
      match /likes/{likeId} {
        allow read: if true;
        allow create: if isSignedIn() &&
                         request.resource.data.userId == request.auth.uid;
        allow delete: if isUser(resource.data.userId) || isAdmin();
      }
    }
    
    // ========== COMMENTS COLLECTION ==========
    match /comments/{commentId} {
      allow read: if true;
      
      allow create: if isSignedIn() &&
                       request.resource.data.userId == request.auth.uid;
      
      allow update: if isUser(resource.data.userId) || isAdmin();
      
      allow delete: if isUser(resource.data.userId) || isAdmin();
    }
    
    // ========== LIKES COLLECTION ==========
    match /likes/{likeId} {
      allow read: if true;
      
      allow create: if isSignedIn() &&
                       request.resource.data.userId == request.auth.uid;
      
      allow delete: if isUser(resource.data.userId) || isAdmin();
    }
    
    // ========== SAVES COLLECTION ==========
    match /saves/{saveId} {
      // Sadece kendi kaydettiklerini görebilir
      allow read: if isUser(resource.data.userId);
      
      allow create: if isSignedIn() &&
                       request.resource.data.userId == request.auth.uid;
      
      allow delete: if isUser(resource.data.userId) || isAdmin();
    }
    
    // ========== FOLLOWS COLLECTION ==========
    match /follows/{followId} {
      allow read: if true;
      
      allow create: if isSignedIn() &&
                       request.resource.data.followerId == request.auth.uid;
      
      allow delete: if isUser(resource.data.followerId) || isAdmin();
    }
    
    // ========== CATEGORIES COLLECTION ==========
    match /categories/{categoryId} {
      allow read: if true;
      
      // Sadece admin yazabilir
      allow write: if isAdmin();
    }
    
    // ========== REPORTS COLLECTION ==========
    match /reports/{reportId} {
      allow create: if isSignedIn() &&
                       request.resource.data.reporterId == request.auth.uid;
      
      // Sadece admin görebilir
      allow read: if isAdmin();
      
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }
    
    // ========== NOTIFICATIONS COLLECTION (Phase 2) ==========
    match /notifications/{notificationId} {
      // Sadece alıcı görebilir
      allow read: if isUser(resource.data.userId);
      
      // Sistema tarafından (Function) yazılır
      allow write: if false;
    }
  }
}
```

---

## Firestore Indexes

### Composite Indexes

Aşağıdaki composite indexes'leri Firebase Console'de oluşturun:
**Firestore Database → Indexes → Create Index**

#### Users Collection
Gerekli composite indexes yok (single field indexes otomatik)

#### Posts Collection
```
Index 1:
- Collection: posts
- Fields:
  - status (Ascending)
  - createdAt (Descending)

Index 2:
- Collection: posts
- Fields:
  - authorId (Ascending)
  - createdAt (Descending)

Index 3:
- Collection: posts
- Fields:
  - isFeatured (Ascending)
  - createdAt (Descending)

Index 4:
- Collection: posts
- Fields:
  - category (Ascending)
  - createdAt (Descending)
```

#### Comments Collection
```
Index 1:
- Collection: comments
- Fields:
  - postId (Ascending)
  - createdAt (Descending)

Index 2:
- Collection: comments
- Fields:
  - userId (Ascending)
  - createdAt (Descending)
```

#### Likes Collection
```
Index 1:
- Collection: likes
- Fields:
  - postId (Ascending)
  - createdAt (Descending)

Index 2:
- Collection: likes
- Fields:
  - userId (Ascending)
  - createdAt (Descending)
```

#### Follows Collection
```
Index 1:
- Collection: follows
- Fields:
  - followerId (Ascending)
  - createdAt (Descending)

Index 2:
- Collection: follows
- Fields:
  - followingId (Ascending)
  - createdAt (Descending)
```

---

## Collection Oluşturma

Firestore **boş collection oluşturamaz**. Firebase Console'da bir collection yalnızca **en az bir belge** yazıldıktan sonra görünür. Boş collection'lar Console'da listelenmez — bu beklenen davranıştır.

### Storage ≠ Firestore (sık karıştırılan nokta)

| Komut | Ne yapar | Console'da nerede görünür |
|-------|----------|---------------------------|
| `npm run init-storage` | Storage'da `events/`, `posts/` **dosya yolları** (`.keep` placeholder) | **Firebase Storage** → Files |
| `npm run init-firestore` | Firestore'da **belge** yazar → collection oluşur | **Firestore Database** → Data |

`init-storage` Firestore collection'ı **oluşturmaz**. Storage klasörleri ile Firestore collection'ları farklı ürünlerdir.

### Otomatik init script (önerilen)

`.env.local` içinde Firebase Admin kimlik bilgileri varken:

```bash
npm run init-firestore
```

Script şunları yapar:

| Collection | Davranış |
|------------|----------|
| `categories` | Varsayılan 10 kategori seed eder (yoksa) |
| `events` | `_init` placeholder (gerçek veri: `npm run sync-events`) |
| `newsDrafts` | `_init` placeholder (gerçek veri: `npm run ingest-news`) |
| `conversations` | `_init` placeholder (gerçek DM'ler kullanıcı mesajlaşınca oluşur) |
| `posts` | `_init` readme — **asıl içerik `news` collection'ında** |
| `reports` | Atlanır — kullanıcı şikayet edince oluşur |
| `cities` | **Firestore collection değil** — `src/constants/cities.ts` statik liste |

Gerçek veri doldurmak (Next.js sunucusu veya prod URL + secret gerekir):

```bash
npm run sync-events    # events — EVENTS_SYNC_SECRET veya CRON_SECRET
npm run ingest-news    # newsDrafts → admin onayı → news
npm run init-firestore -- --sync-events   # init + ardından event sync API çağrısı
```

### `news` vs `posts` — hangi collection?

Kod tabanında video feed ve kullanıcı içeriği **`news`** collection'ında tutulur (`VIDEO_FEED_COLLECTION = Collections.NEWS`). `posts` collection'ı yalnızca bazı engagement sayaçları (views/shares) için ayna/legacy kullanımıdır; yeni içerik **`news`**'e yazılmalıdır.

### Manuel oluşturma (Console)

1. Firebase Console → Firestore Database
2. **"Start collection"**
3. Collection ID (ör. `categories`)
4. En az bir belge ekleyin

### Kodda tanımlı collection'lar

`src/lib/firebase/firestore.ts` → `Collections` enum:

`users`, `news`, `newsDrafts`, `posts`, `comments`, `likes`, `saved`, `follows`, `categories`, `events`, `reports`, `notifications`, `conversations` (+ alt collection `messages`)

`cities` ayrı bir Firestore collection **değildir**; 81 il `src/constants/cities.ts` içinde statik tanımlıdır, event belgeleri `citySlug` alanı taşır.

### Event sync (`events` collection)

| Alan | Açıklama |
|------|----------|
| `source` / `provider` | Ticket platform id ve görünen ad (biletix, bubilet, biletino) |
| `sourceId` | Sağlayıcının kendi event id'si (`externalId` yoksa `sourceHash`) |
| `sourceHash` | Doc id'nin hash segmenti (`{source}_{sourceHash}`) |
| `fingerprint` | İçerik hash'i — sync değişmeyen kayıtları atlar |
| `timelineStatus` | `upcoming` / `past` (günlük sync günceller) |
| `syncedAt` | Son başarılı yazım zamanı (ISO) |

**Zamanlama:** Vercel cron `0 21 * * *` → her gece **00:00 İstanbul** (UTC+3). Manuel: `npm run sync-events` veya `/admin/events` → "Şimdi senkronize et".

**Auth:** `POST /api/events/sync` — `Authorization: Bearer $EVENTS_SYNC_SECRET` veya `$CRON_SECRET` (Vercel cron otomatik enjekte eder).

**İstemci:** Etkinlik sayfası yalnızca Firestore `events` koleksiyonundan okur; koleksiyon boşsa `/api/events/aggregate` tek seferlik fallback çalışır.

**Meta:** Son sync istatistikleri `meta/eventSync` belgesinde (admin panelden okunur).

### Paribu Cineverse — Çanakkale sinema seansları

Paribu Cineverse **17 Çanakkale Burda** vizyondaki filmler ve seans saatleri günlük olarak `events` koleksiyonuna yazılır (`source: paribu-cineverse`, `category: cinema`, etiket `Sinema`).

| Alan | Değer |
|------|--------|
| Doc id | `paribu-17burda-{filmSlug}-{YYYY-MM-DD}` |
| `citySlug` / `districtSlug` | `canakkale` / `merkez` |
| `venue` | Paribu Cineverse 17 Çanakkale Burda |
| `ticketUrl` | Paribu biletleme veya sinema sayfası |
| `dateLabel` | Günün seans saatleri (örn. `12:45 · 15:00`) |

**Kaynak:** `https://www.paribucineverse.com/sinemalar/17-burda` (+ `?tarih=DD-MM-YYYY` ile yakın günler).

**Zamanlama:** Vercel cron `0 5 * * *` UTC → her sabah **08:00 İstanbul**. Manuel: `npm run sync-paribu-canakkale`.

**Auth:** `GET/POST /api/cron/paribu-canakkale` — `Authorization: Bearer $CRON_SECRET` (veya `$EVENTS_SYNC_SECRET`).

**Meta:** Son sync istatistikleri `meta/paribuCineverseSync` belgesinde.

---

## Storage Setup

### Firebase Storage Kurma

1. Firebase Console → Storage
2. **"Get Started"** tıklayın
3. Rules'ları ayarlayın

### Storage Security Rules

Deploy from the repo root:

```bash
npx firebase-tools deploy --only storage
```

Canonical object paths (Firebase Storage has no real folders — paths are object keys):

| Path | Purpose | Read | Write |
|------|---------|------|-------|
| `events/{eventId}/…` | Event cover / cached images | Public | Admin only |
| `events/images/…` | Shared event imagery | Public | Admin only |
| `posts/{userId}/{postId}/…` | User post images & videos | Public | Owner (`userId`) |
| `avatars/{userId}/…` | Profile photos | Public | Owner |
| `news-images/…`, `news-videos/…` | Legacy post media | Public | Owner (existing files) |

Initialize Console-visible folder prefixes (`.keep` placeholders):

```bash
npm run init-storage
```

Rules source: `storage.rules`. Path helpers: `src/lib/firebase/storage.ts`.

---

## Authentication Setup

### Email/Password Aktif Etme

1. Firebase Console → Authentication
2. **"Sign-in method"** sekmesini açın
3. **"Email/Password"** seçin
4. Toggle'ı **aktif** etmeyin
5. **"Save"** tıklayın

### Diğer Sign-in Methods (Phase 2)

- Google Sign-In ✅
- GitHub Sign-In ✅
- Anonymous Sign-In (optional)

---

## Veri Modelleme Best Practices

### Denormalization (Verileri Tekrar Etme)

Posts collection'ında:
```typescript
{
  authorId: "user123",
  authorName: "Ali Yilmaz",      // Denormalize
  authorAvatar: "url...",         // Denormalize
  // ... Profil güncellendiğinde Cloud Function'lar bunu update eder
}
```

**Avantaj:** Veri getirme hızlı (join gerek yok)
**Dezavantaj:** Tutarlılık için Cloud Functions gerekli

### Subcollections vs Root Collections

**Subcollection kullan:**
- Posts'un comments'leri (her postu ile ilgili)
- Posts'un likes'ları

**Root collection kullan:**
- Genel sorgulamalar (tüm comments)
- Cross-post filtering

---

## Firestore Query Patterns

### Pagination
```typescript
// İlk 20 post
query(
  collection(db, 'posts'),
  where('status', '==', 'published'),
  orderBy('createdAt', 'desc'),
  limit(20)
);

// Sonraki sayfa (cursor-based)
query(
  collection(db, 'posts'),
  where('status', '==', 'published'),
  orderBy('createdAt', 'desc'),
  startAfter(lastDoc),
  limit(20)
);
```

### Real-time Updates
```typescript
// Listener
onSnapshot(
  query(collection(db, 'posts'), limit(10)),
  (snapshot) => {
    // Güncelleme her yazıldığında
  }
);
```

---

## Monitoring & Costs

### Firestore Pricing
- **Reads:** $0.06 per 100K
- **Writes:** $0.18 per 100K
- **Deletes:** $0.02 per 100K
- **Storage:** $0.18 per GB/month

### Cost Optimization
1. ✅ Denormalization (fewer reads)
2. ✅ Composite indexes (specific queries)
3. ✅ Caching (client-side)
4. ✅ Pagination (limit results)

---

**Firestore Kurulum Tarihi:** 2026-06-06
**Versiyon:** 1.0
