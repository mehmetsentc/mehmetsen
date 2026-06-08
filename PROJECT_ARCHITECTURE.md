# NaHaber - Proje Mimarisi & Kurulum Planı

## 📋 İçerik
1. [Proje Mimarisi](#proje-mimarisi)
2. [Klasör Yapısı](#klasör-yapısı)
3. [Teknoloji Stack](#teknoloji-stack)
4. [npm Paketleri](#npm-paketleri)
5. [Kurulum Adımları](#kurulum-adımları)
6. [Ortam Değişkenleri (.env.local)](#ortam-değişkenleri)
7. [Firebase Kurulumu](#firebase-kurulumu)
8. [Firestore Koleksiyonları](#firestore-koleksiyonları)
9. [Uygulama Sayfaları & Routes](#uygulama-sayfaları--routes)
10. [Geliştirme Yol Haritası](#geliştirme-yol-haritası)

---

## 1. Proje Mimarisi

### Katmanlı Mimari (Layered Architecture)

```
┌─────────────────────────────────────┐
│       UI Layer (Components)         │
│  - React Components + TypeScript    │
│  - Tailwind CSS Styling             │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│    Hook Layer (Custom Hooks)        │
│  - State Management (Zustand)       │
│  - Data Fetching & Caching          │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│      Service Layer (Business Logic) │
│  - API Calls & Operations           │
│  - Data Transformation              │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│      Firebase Integration           │
│  - Authentication (Firebase Auth)   │
│  - Database (Firestore)             │
│  - Storage (Firebase Storage)       │
└─────────────────────────────────────┘
```

**Faydalı Özellikleri:**
- ✅ Düşük bağımlılık (Low coupling)
- ✅ Yüksek uyum (High cohesion)
- ✅ Kolay test edilebilir
- ✅ Ölçeklenebilir
- ✅ Bakım ve geliştirme kolay

---

## 2. Klasör Yapısı

```
nahaber/
├── .github/
│   ├── agents/                    # Custom Copilot agents
│   │   └── kod-yazimcisi.agent.md
│   ├── instructions/              # File-specific instructions
│   └── hooks/                     # Git hooks (optional)
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Home page
│   │   ├── globals.css            # Global styles
│   │   │
│   │   ├── (auth)/                # Auth routes group
│   │   │   ├── layout.tsx
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (main)/                # Main app routes group
│   │   │   ├── layout.tsx
│   │   │   ├── feed/
│   │   │   │   └── page.tsx       # Ana haber akışı
│   │   │   ├── post/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx   # Haber detayı
│   │   │   │   └── create/
│   │   │   │       └── page.tsx   # Haber oluşturma
│   │   │   ├── profile/
│   │   │   │   └── [username]/
│   │   │   │       └── page.tsx   # Profil sayfası
│   │   │   ├── search/
│   │   │   │   └── page.tsx       # Arama sayfası
│   │   │   ├── saved/
│   │   │   │   └── page.tsx       # Kaydedilen haberler
│   │   │   └── notifications/
│   │   │       └── page.tsx       # Bildirimler
│   │   │
│   │   ├── admin/                 # Admin paneli routes
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx       # Admin dashboard
│   │   │   ├── users/
│   │   │   │   └── page.tsx
│   │   │   ├── posts/
│   │   │   │   └── page.tsx
│   │   │   ├── categories/
│   │   │   │   └── page.tsx
│   │   │   └── reports/
│   │   │       └── page.tsx       # Bildirilen içerik
│   │   │
│   │   ├── error.tsx              # Error boundary
│   │   ├── loading.tsx            # Loading component
│   │   └── not-found.tsx          # 404 page
│   │
│   ├── components/                # Reusable React Components
│   │   ├── ui/                    # UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Skeleton.tsx
│   │   │
│   │   ├── layout/                # Layout components
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MobileNav.tsx
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── auth/                  # Auth components
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── AuthGuard.tsx
│   │   │
│   │   ├── feed/                  # Feed components
│   │   │   ├── FeedList.tsx
│   │   │   ├── PostCard.tsx
│   │   │   └── FeedFilters.tsx
│   │   │
│   │   ├── post/                  # Post detail components
│   │   │   ├── PostDetail.tsx
│   │   │   ├── PostEditor.tsx
│   │   │   ├── MediaUploader.tsx
│   │   │   ├── LikeButton.tsx
│   │   │   ├── SaveButton.tsx
│   │   │   └── ShareButton.tsx
│   │   │
│   │   ├── comments/              # Comment components
│   │   │   ├── CommentList.tsx
│   │   │   ├── CommentItem.tsx
│   │   │   └── CommentForm.tsx
│   │   │
│   │   ├── profile/               # Profile components
│   │   │   ├── ProfileHeader.tsx
│   │   │   ├── ProfileTabs.tsx
│   │   │   └── FollowButton.tsx
│   │   │
│   │   └── admin/                 # Admin components
│   │       ├── AdminSidebar.tsx
│   │       ├── UserTable.tsx
│   │       ├── ReportsTable.tsx
│   │       └── StatsCard.tsx
│   │
│   ├── hooks/                     # Custom React Hooks
│   │   ├── useAuth.ts             # Auth state
│   │   ├── usePosts.ts            # Posts data fetching
│   │   ├── useComments.ts         # Comments operations
│   │   ├── useLike.ts             # Like operations
│   │   ├── useSave.ts             # Save operations
│   │   ├── useFollow.ts           # Follow operations
│   │   ├── useUpload.ts           # File upload
│   │   └── useInfiniteScroll.ts   # Infinite scroll
│   │
│   ├── services/                  # Business Logic & API Calls
│   │   ├── authService.ts         # Auth operations
│   │   ├── postService.ts         # Post CRUD operations
│   │   ├── userService.ts         # User operations
│   │   ├── commentService.ts      # Comment operations
│   │   ├── likeService.ts         # Like operations
│   │   ├── saveService.ts         # Save operations
│   │   ├── followService.ts       # Follow operations
│   │   ├── storageService.ts      # File storage operations
│   │   ├── adminService.ts        # Admin operations
│   │   └── notificationService.ts # Notification logic
│   │
│   ├── store/                     # State Management (Zustand)
│   │   ├── authStore.ts           # Auth state
│   │   ├── feedStore.ts           # Feed state
│   │   └── uiStore.ts             # UI state
│   │
│   ├── lib/                       # Utilities & Configuration
│   │   ├── utils.ts               # Helper functions
│   │   ├── firebase/
│   │   │   ├── config.ts          # Firebase initialization
│   │   │   ├── auth.ts            # Firebase Auth instance
│   │   │   ├── firestore.ts       # Firestore utilities
│   │   │   └── storage.ts         # Firebase Storage utilities
│   │   └── validators/
│   │       ├── auth.ts            # Auth validation schemas
│   │       └── post.ts            # Post validation schemas
│   │
│   ├── types/                     # TypeScript Types
│   │   ├── common.ts              # Common types
│   │   ├── user.ts                # User types
│   │   ├── post.ts                # Post types
│   │   ├── comment.ts             # Comment types
│   │   └── index.ts               # Barrel export
│   │
│   └── constants/                 # Constants
│       ├── config.ts              # App configuration
│       └── routes.ts              # Route definitions
│
├── public/                        # Static assets
│   ├── images/
│   └── icons/
│
├── .env.local                     # Local environment variables
├── .env.example                   # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── README.md
├── PROJECT_ARCHITECTURE.md        # This file
└── FIRESTORE_SETUP.md            # Firestore rules & indexes

```

### Klasörlerin Açıklaması

| Klasör | Amaç |
|--------|------|
| `src/app/` | Next.js App Router sayfaları ve layout'ları |
| `src/components/` | Yeniden kullanılabilir React bileşenleri |
| `src/hooks/` | Özel React Hook'ları (state, veri çekme, vb.) |
| `src/services/` | İş mantığı ve API işlemleri |
| `src/store/` | Global state management (Zustand stores) |
| `src/lib/` | Yardımcı fonksiyonlar ve konfigürasyonlar |
| `src/types/` | TypeScript tip tanımlamaları |
| `src/constants/` | Uygulamada kullanılan sabitler |
| `public/` | Statik kaynaklar (resimler, ikonlar, vb.) |

---

## 3. Teknoloji Stack

### Core Framework
- **Next.js 15+** - React framework with App Router
- **React 19+** - UI library
- **TypeScript 5+** - Type safety

### Styling & UI
- **Tailwind CSS 3+** - Utility-first CSS
- **PostCSS** - CSS processing
- **Tailwind UI Plugins** (optional)

### State Management
- **Zustand** - Lightweight state management
- **TanStack Query (React Query)** - Server state & caching (optional, Phase 2)

### Backend & Database
- **Firebase Auth** - Authentication
- **Firestore** - Real-time NoSQL database
- **Firebase Storage** - File storage (images, videos)
- **Firebase Cloud Functions** (Phase 2)

### Form Handling & Validation
- **React Hook Form** - Form state management
- **Zod** - TypeScript-first validation

### HTTP & Utilities
- **Axios** (optional) - HTTP client
- **date-fns** - Date utilities
- **clsx/classnames** - Conditional styling

### Developer Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking
- **Husky** - Git hooks (optional)

---

## 4. npm Paketleri

### Installation Command
```bash
npm install
# or
yarn install
# or
pnpm install
```

### Paket Listesi

```json
{
  "dependencies": {
    "next": "^15.5.19",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.3",
    
    "firebase": "^10.7.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.52.0",
    "zod": "^3.23.8",
    "tailwindcss": "^3.4.3",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.18",
    
    "date-fns": "^3.6.0",
    "clsx": "^2.1.1",
    "axios": "^1.7.2"
  },
  
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.5.19",
    "prettier": "^3.3.0",
    "husky": "^9.1.4",
    "lint-staged": "^15.2.7"
  }
}
```

---

## 5. Kurulum Adımları

### Adım 1: Proje Oluşturma
```bash
# Proje zaten oluşturulmuş, varsa güncelleyin
npm install
```

### Adım 2: Ortam Değişkenlerini Ayarlama
```bash
# .env.local dosyasını oluştur
cp .env.example .env.local

# Firebase values'lerini ekle (bkz. adım 6)
```

### Adım 3: Firebase Projesi Kurma
1. [Firebase Console](https://console.firebase.google.com) açın
2. Yeni proje oluşturun: "NaHaber"
3. Web uygulaması ekleyin
4. Configuration values'lerini `.env.local` e yapıştırın

### Adım 4: Firestore Kurma
1. Firebase Console'de Firestore Database oluşturun
2. Production mode'da başlatın
3. Koleksiyon yapısını oluşturun (bkz. Firestore Koleksiyonları)
4. Firestore rules'ları ayarlayın

### Adım 5: Firebase Storage Kurma
1. Firebase Console'de Storage'ı etkinleştirin
2. Upload kurallarını ayarlayın (`storage.rules` → `npx firebase-tools deploy --only storage`)
3. Klasör öneklerini oluşturun: `npm run init-storage`

**Storage yolları:** `events/{eventId}/`, `events/images/`, `posts/{userId}/{postId}/`, `avatars/{userId}/` — ayrıntılar için `FIRESTORE_SETUP.md` → Storage Setup.

### Adım 6: Geliştirme Sunucusunu Başlatma
```bash
npm run dev
```
Sonra http://localhost:3000 açın

---

## 6. Ortam Değişkenleri (.env.local)

### .env.example dosyası:
```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# App Configuration
NEXT_PUBLIC_APP_NAME=NaHaber
NEXT_PUBLIC_APP_URL=http://localhost:3000

# API Configuration (Phase 2)
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Feature Flags (Phase 2)
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

### Değişkenlerin Açıklaması

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API anahtarı | AIza... |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain'i | myapp.firebaseapp.com |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase proje ID'si | my-project-123 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | my-project.appspot.com |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | 123456789 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | 1:123:web:abc123 |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Google Analytics ID | G-ABC123 |

**Not:** `NEXT_PUBLIC_` prefix'i bu değişkenlerin istemci tarafında erişilebilir olmasını sağlar.

---

## 7. Firebase Kurulumu

### Gerekli Hizmetler

| Hizmet | Durum | Amaç |
|--------|-------|------|
| **Authentication** | ✅ Aktif | Kullanıcı kayıt/giriş |
| **Firestore Database** | ✅ Aktif | Veritabanı |
| **Storage** | ✅ Aktif | Resim/video upload |
| **Cloud Functions** | ⏳ Phase 2 | Sunucu tarafı işlemleri |
| **Realtime Database** | ❌ Gerek yok | - |

### Authentication Ayarları

**Etkinleştirmeler:**
1. Email/Password sign-in ✅
2. Google Sign-In ⏳ (Phase 2)
3. Anonymous sign-in ❌
4. Phone sign-in ❌

### Security Rules (Firestore)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Public rules
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth.uid == userId;
    }
    
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.authorId;
    }
    
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId;
    }
    
    // Private collections
    match /likes/{likeId} {
      allow read: if true;
      allow create, delete: if request.auth.uid == request.resource.data.userId;
    }
    
    match /saves/{saveId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow create, delete: if request.auth.uid == request.resource.data.userId;
    }
    
    match /follows/{followId} {
      allow read, create, delete: if request.auth.uid == request.resource.data.followerId;
    }
  }
}
```

---

## 8. Firestore Koleksiyonları

### Koleksiyon Yapısı

```
Firestore
├── users/
├── posts/
├── comments/
├── likes/
├── saves/
├── follows/
├── categories/
├── reports/
└── notifications/
```

### Koleksiyon Detayları

#### 1. **users** Collection
**Amaç:** Kullanıcı profil ve hesap bilgileri

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;                    // User ID (Firebase Auth UID)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Profil
  email: string;                 // Benzersiz email
  username: string;              // Benzersiz kullanıcı adı (@username)
  displayName: string;           // Görünen ad
  bio: string;                   // Kısa biyografi
  avatar: string;                // Avatar URL
  coverImage: string;            // Kapak resmi URL
  
  // İstatistikler
  postsCount: number;            // Toplam haber sayısı
  followersCount: number;        // Takipçi sayısı
  followingCount: number;        // Takip edilen sayısı
  
  // Ayarlar
  isPublic: boolean;             // Hesap herkese açık mı
  isAdmin: boolean;              // Admin mi
  isBanned: boolean;             // Yasaklı mı
  
  // İletişim
  website?: string;              // Website
  location?: string;             // Konum
  
  // Preferences
  theme: 'light' | 'dark' | 'auto';
  language: 'tr' | 'en';
  notificationsEnabled: boolean;
}
```

**Indexes:**
- `username` (ascending)
- `createdAt` (descending)
- `isPublic` (ascending)

---

#### 2. **posts** Collection
**Amaç:** Haber/gönderi içeriği

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;                    // Belge ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // İçerik
  title: string;                 // Başlık (required)
  content: string;               // İçerik (required, max 5000 chars)
  excerpt?: string;              // Özet (max 200 chars)
  
  // Yazar Bilgisi
  authorId: string;              // Yazarın user ID'si
  authorName: string;            // Yazarın adı (denormalize)
  authorAvatar?: string;         // Yazarın avatarı (denormalize)
  
  // Medya
  images: string[];              // Resim URLleri
  videos: string[];              // Video URLleri
  mediaCount: number;            // Toplam medya sayısı
  
  // Kategorisiz
  category: string;              // Kategori ID
  tags: string[];                // Etiketler
  
  // İstatistikler
  likesCount: number;            // Beğeni sayısı
  commentsCount: number;         // Yorum sayısı
  savesCount: number;            // Kaydetme sayısı
  sharesCount: number;           // Paylaşım sayısı
  viewsCount: number;            // Görüntülenme sayısı
  
  // Durum
  status: 'draft' | 'published' | 'archived'; // Yayın durumu
  isDraft: boolean;              // Taslak mı
  isFeatured: boolean;           // Öne çıkan mı
  
  // Kontrol
  allowComments: boolean;        // Yorum açık mı
  allowSharing: boolean;         // Paylaşım açık mı
}
```

**Indexes:**
- `createdAt` (descending)
- `status` (ascending) + `createdAt` (descending)
- `authorId` (ascending) + `createdAt` (descending)
- `isFeatured` (ascending) + `createdAt` (descending)

**Subcollections:**
```
posts/{postId}/
├── comments/           # Bu postun yorumları
├── likes/             # Bu posta beğeniler
└── analytics/         # Görüntülenme vs analytics
```

---

#### 3. **comments** Collection
**Amaç:** Post yorumları

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  postId: string;                // İlgili post ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // İçerik
  content: string;               // Yorum metni (max 500 chars)
  
  // Yazar
  userId: string;                // Yorum yapanın ID'si
  userName: string;              // Yorum yapanın adı (denormalize)
  userAvatar?: string;           // Avatar (denormalize)
  
  // İstatistikler
  likesCount: number;            // Yorum beğenileri
  repliesCount: number;          // Cevap sayısı (Phase 2)
  
  // Kontrol
  status: 'approved' | 'pending' | 'rejected';
  isDeleted: boolean;
  deletedAt?: Timestamp;
}
```

**Indexes:**
- `postId` (ascending) + `createdAt` (descending)
- `userId` (ascending) + `createdAt` (descending)

---

#### 4. **likes** Collection
**Amaç:** Beğeni kaydı

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  createdAt: Timestamp;
  
  // İlişkiler
  postId: string;                // Beğenilen post
  userId: string;                // Beğenen kullanıcı
  
  // Kontrol
  type: 'post' | 'comment';      // Beğeni tipi
}
```

**Indexes:**
- `postId` (ascending) + `createdAt` (descending)
- `userId` (ascending) + `createdAt` (descending)
- Compound index: postId + userId (unique check)

---

#### 5. **saves** Collection
**Amaç:** Kaydedilen haberler

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  createdAt: Timestamp;
  
  // İlişkiler
  postId: string;                // Kaydedilen post
  userId: string;                // Kaydedenin ID'si
  
  // Kontrol
  folder?: string;               // Koleksiyon klasörü (Phase 2)
}
```

**Indexes:**
- `userId` (ascending) + `createdAt` (descending)
- `postId` (ascending)

---

#### 6. **follows** Collection
**Amaç:** Takip ilişkileri

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  createdAt: Timestamp;
  
  // İlişkiler
  followerId: string;            // Takip edenin ID'si
  followingId: string;           // Takip edilenin ID'si
  
  // Durum
  isActive: boolean;             // Aktif mi
  mutedAt?: Timestamp;           // Sessiz yapılma zamanı (Phase 2)
}
```

**Indexes:**
- `followerId` (ascending) + `createdAt` (descending)
- `followingId` (ascending) + `createdAt` (descending)

---

#### 7. **categories** Collection
**Amaç:** Haber kategorileri

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Bilgi
  name: string;                  // Kategori adı
  slug: string;                  // URL-friendly slug
  description?: string;
  icon?: string;                 // Icon URL
  color?: string;                // Renk kodu
  
  // İstatistikler
  postsCount: number;            // Bu kategorideki post sayısı
  
  // Kontrol
  isActive: boolean;
  order: number;                 // Sıralama
}
```

**Indexes:**
- `slug` (ascending)
- `order` (ascending)

---

#### 8. **reports** Collection
**Amaç:** Uygunsuz içerik raporları

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  createdAt: Timestamp;
  
  // Rapor Bilgisi
  reporterId: string;            // Rapor yapanın ID'si
  type: 'post' | 'comment' | 'user'; // Rapor tipi
  targetId: string;              // Hedef ID (post, comment, user)
  
  // İçerik
  reason: string;                // Rapor nedeni
  description: string;           // Detaylı açıklama
  
  // Kanıt
  evidenceUrls?: string[];       // Kanıt URL'leri
  
  // Durum
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected';
  
  // Admin
  reviewedBy?: string;           // Inceleyen admin ID
  reviewedAt?: Timestamp;
  action?: string;               // Alınan aksiyon
  notes?: string;                // Admin notları
}
```

**Indexes:**
- `status` (ascending) + `createdAt` (descending)
- `type` (ascending) + `status` (ascending)

---

#### 9. **notifications** Collection (Phase 2)
**Amaç:** Kullanıcı bildirimleri

**Belge Yapısı:**
```typescript
{
  // Meta
  id: string;
  userId: string;                // Alıcı
  createdAt: Timestamp;
  
  // İçerik
  type: 'like' | 'comment' | 'follow' | 'mention'; // Bildirim tipi
  title: string;
  message: string;
  actionUrl: string;             // Tıklanınca gidilecek URL
  
  // Gönderici
  senderId: string;
  senderName: string;
  
  // Durum
  isRead: boolean;
  readAt?: Timestamp;
}
```

---

## 9. Uygulama Sayfaları & Routes

### Route Haritası

```
NaHaber App Routes

Public Routes (Auth Yok)
├── /                           # Home page / Landing
├── /login                       # Giriş sayfası
├── /register                    # Kayıt sayfası
└── /post/[id]                  # Haber detayı (read-only)

Protected Routes (Auth Gerekli)
├── (main) group
│   ├── /feed                    # Ana akış
│   ├── /post/create             # Haber oluştur
│   ├── /post/[id]               # Haber detayı (full)
│   ├── /profile/[username]      # Profil sayfası
│   ├── /search                  # Arama
│   ├── /saved                   # Kaydedilen haberler
│   └── /notifications           # Bildirimler
│
└── Admin Routes (Admin Yetki Gerekli)
    └── /admin
        ├── /dashboard           # Admin dashboard
        ├── /users               # Kullanıcı yönetimi
        ├── /posts               # Post yönetimi
        ├── /categories          # Kategori yönetimi
        └── /reports             # Rapor yönetimi

Error Pages
├── /error                       # Error boundary
├── /loading                     # Loading state
└── /not-found                   # 404
```

### Sayfa Detayları

| Route | Komponenter | Durum |
|-------|------------|-------|
| `/` | Home | Phase 1 |
| `/login` | LoginForm | ✅ Hazır |
| `/register` | RegisterForm | ✅ Hazır |
| `/feed` | FeedList, PostCard | Phase 1 |
| `/post/create` | PostEditor, MediaUploader | Phase 1 |
| `/post/[id]` | PostDetail, CommentList, CommentForm | Phase 1 |
| `/profile/[username]` | ProfileHeader, ProfileTabs | Phase 1 |
| `/search` | SearchForm, FeedList | Phase 2 |
| `/saved` | SavedPostsList | Phase 1 |
| `/notifications` | NotificationList | Phase 2 |
| `/admin/dashboard` | StatsCard, Charts | Phase 2 |
| `/admin/users` | UserTable | Phase 2 |
| `/admin/posts` | PostTable | Phase 2 |
| `/admin/reports` | ReportsTable | Phase 2 |

---

## 10. Geliştirme Yol Haritası

### Phase 1: Core Features (Hafta 1-2)
**Authentication & User System**
- ✅ Login Form (`src/components/auth/LoginForm.tsx`)
- ✅ Register Form (`src/components/auth/RegisterForm.tsx`)
- ✅ AuthGuard Component (`src/components/auth/AuthGuard.tsx`)
- ✅ useAuth Hook (`src/hooks/useAuth.ts`)
- [ ] User Profile Page
- [ ] User Settings

**Post Management**
- [ ] Post Creation (Editor + Upload)
- [ ] Post List (Feed)
- [ ] Post Detail View
- [ ] Post Editing
- [ ] Post Deletion

**Core Interactions**
- [ ] Like/Unlike functionality
- [ ] Comment system
- [ ] Save posts
- [ ] Follow/Unfollow users

### Phase 2: Enhanced Features (Hafta 3-4)
**Search & Discovery**
- [ ] Full-text search
- [ ] Category filtering
- [ ] Tag-based discovery
- [ ] Trending posts

**Notifications**
- [ ] Real-time notifications
- [ ] Notification center
- [ ] Push notifications (optional)

**Admin Panel**
- [ ] Dashboard with analytics
- [ ] User management
- [ ] Content moderation
- [ ] Report handling

### Phase 3: Advanced Features (Hafta 5+)
**Performance & Scaling**
- [ ] Image optimization
- [ ] Lazy loading
- [ ] Caching strategy
- [ ] CDN integration

**Social Features**
- [ ] Bookmarks collections
- [ ] User mentions
- [ ] Direct messages (optional)
- [ ] Sharing to social media

**Analytics & SEO**
- [ ] Google Analytics
- [ ] SEO optimization
- [ ] Meta tags
- [ ] Sitemap

---

## 📋 Sonraki Adımlar

### Immediate Actions
1. Firebase Console'de proje oluştur
2. `.env.local` dosyasını doldur
3. Firestore collections oluştur
4. Security Rules'ları ayarla

### Development Order
```
1. Complete Auth (Login/Register)
   ↓
2. User Profile & Settings
   ↓
3. Post Creation & Display
   ↓
4. Feed & Interactions (Like, Comment, Save)
   ↓
5. Follow System
   ↓
6. Search & Discovery
   ↓
7. Admin Panel
   ↓
8. Notifications (Real-time)
   ↓
9. Performance & Optimization
   ↓
10. Deployment & Monitoring
```

---

## 🛠️ Komutlar Özeti

```bash
# Kurulum
npm install

# Geliştirme
npm run dev          # http://localhost:3000

# Build
npm run build
npm start            # Production

# Linting & Formatting
npm run lint
npm run format

# Type checking
npm run type-check

# Firebase Emulator (Phase 2)
firebase emulators:start
```

---

## 📚 Kaynaklar

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs/)

---

---

## 11. AI Haber Pipeline (v1.1 — 2026-06-07)

### Akış

```
Vercel Cron (* * * * *)  ──►  /api/cron/news-ingest
        │                         │
        │                         ├─► rss/sources.ts (12 kaynak)
        │                         ├─► rss/rssFetcher.ts (rss-parser)
        │                         ├─► aiNewsEditor.ts (OpenAI rewrite)
        │                         └─► newsSyncService.ts → Firestore `news` (status: pending)
        │
Admin /admin/news  ──►  Onayla → status: published → /feed + /post/[id]
```

### Yeni / Güncellenen Dosyalar

| Dosya | Amaç |
|-------|------|
| `src/services/rss/sources.ts` | AA, İHA, DHA, Reuters, BBC, CNN, TRT, NTV, Habertürk, Sözcü, T24, Gazete Duvar |
| `src/services/rss/rssFetcher.ts` | RSS fetch + dedupe fingerprint |
| `src/services/aiNewsEditor.ts` | OpenAI rewrite, kategori, şehir, `Kaynak:` satırı |
| `src/services/newsSyncService.ts` | Dedupe + pending Firestore yazımı (Admin SDK) |
| `src/app/api/cron/news-ingest/route.ts` | Cron endpoint (`CRON_SECRET`) |
| `scripts/ingest-news.mjs` | Yerel CLI runner |
| `src/types/news.ts` | Ingestion meta tipleri |
| `src/app/(main)/discover/page.tsx` | Keşfet: trend, video, şehir |
| `src/lib/seo.ts` | `buildNewsArticleJsonLd()` |

### Firestore Şeması (Production)

| Koleksiyon | Amaç | Public read |
|------------|------|-------------|
| `users` | Profil, rol, `citySlug`, `interests`, `favoriteCategories` | Evet |
| `news` | Yayınlanmış haberler (`slug`, `status: published`) | Evet |
| `newsDrafts` | AI ingestion kuyruğu (`draftStatus: pending_review`) | Hayır (admin) |
| `newsArchive` | RSS arşiv backfill (feed dışı, `status: archived`) | Evet (read) |
| `likes` | Beğeni (`userId_postId`) | Auth |
| `comments` | Yorumlar (`postId`) | Evet |
| `saved` | Kaydedilen haberler | Auth |
| `follows` | Takip ilişkileri | Evet |
| `notifications` | Bildirimler | Auth |
| `categories` | Kategori meta | Evet |
| `events` | Etkinlik agregasyonu | Evet |
| `cities` | (implicit) `citySlug` on news/users | — |

## Autonomous News Agency — 24/7 Real-Time AI Newsroom

NaHaber **canlı haber ajansı** olarak çalışır — arşiv birincil ürün değildir. Varsayılan: **AUTO-PUBLISH** (`news.status: published`). `newsDrafts` yalnızca confidence <50, moderation review veya ciddi fact-check hatasında.

### Mimari Diyagram

```
Vercel Cron: breaking 2m | national 5m | local 10m | trend 15m | influencer 30m | queue 1m
       │
       ▼
RSS/Trends fetch → changeDetector (sourceFingerprints: new|updated|removed)
       │
       ▼
newsQueue (pending→processing→published|failed|dead_letter)
       │
       ▼
pipeline: AI rewrite → fact-check → similarity dedupe → category/geo → moderation
       ├─ low confidence / review → newsDrafts
       └─ DEFAULT → news (published) + breakingScore/isPinned/isTrending
       │
       ▼
useTimelineFeed (onSnapshot) + feedRanking (pinned→local→breaking→trending)
```

### Pipeline Akışı (AUTO-PUBLISH default)

```
Kaynak → queue → AI rewrite → fact-check → dedupe (>90% → update existing)
    → category/geo → moderation
    → confidence < 50 OR bad fact-check OR moderation review?
         ├─ Evet → newsDrafts
         └─ Hayır → news (published) — DEFAULT
```

`NEWSROOM_AUTO_PUBLISH_THRESHOLD` = **70** (dokümantasyon; pratikte taslak yalnızca düşük güven/review).

### Workers (`src/services/newsroom/workers/`)

| Worker | Interval | Cron | File |
|--------|----------|------|------|
| Breaking | 2 min | `/api/cron/newsroom/breaking` | `breakingWorker.ts` |
| National | 5 min | `/api/cron/newsroom/national` | `nationalWorker.ts` |
| Local | 10 min | `/api/cron/newsroom/local` | `localWorker.ts` |
| Trend | 15 min | `/api/cron/newsroom/trend` | `trendWorker.ts` |
| Influencer | 30 min | `/api/cron/newsroom/influencer` | `influencerWorker.ts` |
| Queue | 1 min | `/api/cron/newsroom/process-queue` | `queue/queueProcessor.ts` |

Detection: `detection/sourceFingerprint.ts`, `detection/changeDetector.ts`  
Dedupe: `dedupe/similarityEngine.ts`  
Queue: `queue/newsQueueService.ts`, `queue/queueProcessor.ts`

### DEPRECATED (ürün değil)

| Eski yol | Durum |
|----------|-------|
| `/api/cron/news-ingest` | Legacy manual-first RSS → draft |
| `/api/cron/newsroom/ingest` | Birleşik 10dk — ayrı worker kullanın |
| `approve-news-drafts` normal akış | Yalnızca düşük güven taslakları |
| `archiveEditor` günlük primary | Haftalık backfill (`0 3 * * 0`); feed değil |

### 8 Editör (legacy referans + pipeline modülleri)

| Editör | ID | Zamanlama | Cron | Dosya |
|--------|-----|-----------|------|-------|
| Yerel + Son Dakika (birleşik) | `ingest` | 10 dk | `/api/cron/newsroom/ingest` | `ingestRunner.ts` → `localNewsEditor` + `breakingNewsEditor` |
| Yerel Haber (tek) | `local-news` | 10 dk | `/api/cron/newsroom/local` | `localNewsEditor.ts` |
| Son Dakika (tek) | `breaking-news` | 10 dk | `/api/cron/newsroom/breaking` | `breakingNewsEditor.ts` |
| Trend | `trend` | 1 saat | `/api/cron/newsroom/trend` | `trendEditor.ts` |
| Influencer | `influencer` | 1 saat | `/api/cron/newsroom/influencer` | `influencerEditor.ts` |
| Etkinlik | `event` | günlük | `/api/events/sync` | `eventEditor.ts` |
| Doğruluk Kontrolü | `fact-checker` | pipeline | — | `factChecker.ts` |
| Kategori Motoru | `category-engine` | pipeline | — | `categoryEngine.ts` |
| Coğrafi Motor | `geo-engine` | pipeline | — | `geoEngine.ts` |
| Arşiv | `archive` | günlük 03:00 TR | `/api/cron/newsroom/archive` | `archiveEditor.ts` |

**Arşiv kaynakları:** Tüm RSS kaynakları (yerel + son dakika + batch kategori feed'leri)

### Arşiv Pipeline (`newsArchive`)

Son 90 gün RSS → dedupe → AI özet (archive mode) → fact-check → kategori/geo → `newsArchive` (feed'e otomatik yayın yok).

```
RSS (90 gün) → fingerprint + sourceUrl dedupe → aiNewsEditor (archive) → factChecker
  → categoryEngine → geoEngine → newsArchive (status: archived, editorId: archive)
```

| Alan | Tip | Açıklama |
|------|-----|----------|
| `title`, `summary`, `content` | string | AI yeniden yazım (summary kısa, content tam metin) |
| `categoryId`, `city`, `district`, `country`, `citySlug` | string | Kategori + geo |
| `source`, `sourceUrl` | string | Orijinal kaynak |
| `fingerprint`, `sourceHash` | string | RSS + URL dedupe |
| `publishedAt` | number \| null | Orijinal RSS tarihi |
| `archivedAt` | number | Arşive yazılma zamanı |
| `tags`, `confidenceScore` | | Etiketler + fact-check skoru |
| `editorId` | `'archive'` | Sabit |
| `status` | `'archived'` | Feed dışı |

**Dedupe:** `fingerprint` (rssFingerprint) ve `sourceUrl`/`sourceHash` — mevcut `news`, `newsDrafts`, `newsArchive` koleksiyonlarında aranır (`src/lib/newsDedupe.ts`).

**Yerel kaynaklar:** AA, İHA, DHA, Sözcü, T24, Gazete Duvar  
**Son dakika kaynakları:** CNN Türk, BBC Türkçe, Reuters, TRT, NTV, Habertürk

### Firestore — Tek `news` Koleksiyonu (feed karmaşıklığından kaçınmak için)

Ayrı `breakingNews` / `trendingNews` koleksiyonları yerine `news` ve `newsDrafts` üzerinde alanlar:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `editorId` | string | Hangi editör üretti |
| `editorType` | `local\|breaking\|trend\|influencer\|event` | Feed badge / filtre |
| `confidenceScore` | number 0–100 | Fact checker çıktısı |
| `factCheckFlags` | string[] | Düşük güven nedenleri |
| `isBreaking` | boolean | Son dakika pin |
| `priorityScore` | number 1–100 | Breaking sıralama (feed üstü) |
| `needsAdminReview` | boolean | Düşük confidence veya moderation review |

### `eventReviews` — Etkinlik Topluluğu

```typescript
{
  eventId: string,
  userId: string,
  userDisplayName: string,
  rating: 1–5,
  comment: string,
  createdAt, updatedAt
}
```

`events` dokümanında türetilmiş: `averageRating`, `ratingCount`, `reviewCount`  
Client: `eventService.rateEvent()`, `eventService.getEventReviews()`

### Feed Entegrasyonu

- `src/lib/feedRanking.ts` — `isBreaking` + `priorityScore` en üst boost
- `NewsTimeline` / `TimelineItem` — "Son Dakika" ve "Trending" rozetleri
- `useTimelineFeed` — Firestore `onSnapshot` (en yeni 12 haber) + 30 sn poll yedek; yeni haberler otomatik prepend + toast
- Sıralama `rankFeedPosts` ile client-side (`isBreaking` + `priorityScore` üstte)

### Ortam Değişkenleri (Newsroom)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `NEWSROOM_AUTO_PUBLISH_THRESHOLD` | `70` | Dokümantasyon eşiği; taslak yalnızca <50/review |
| `NEWSROOM_CRON_SECRET` | `CRON_SECRET` | Cron auth |
| `NEWSROOM_TREND_TOPICS` | TR konuları | Trends RSS fallback |
| `NEWSROOM_INFLUENCERS` | 3 isim | Influencer listesi |
| `NEWSROOM_TRENDS_RSS_URL` | Google Trends TR | Trend kaynağı |

### CLI Komutları

```bash
npm run newsroom-workers           # Tüm worker'lar + queue (bir kez)
npm run newsroom-breaking-worker
npm run newsroom-national-worker
npm run newsroom-local-worker
npm run newsroom-process-queue
npm run newsroom-trend
npm run newsroom-influencer
npm run newsroom-archive           # Haftalık arama backfill (feed değil)
npm run sync-events
```

Lokal cron simülasyonu: `watch -n 120 npm run newsroom-breaking-worker` + `watch -n 60 npm run newsroom-process-queue`

Dev server çalışırken (`npm run dev`); auth: `CRON_SECRET` veya `NEWSROOM_CRON_SECRET`.

### Vercel Cron (vercel.json)

| Path | Schedule | Açıklama |
|------|----------|----------|
| `/api/cron/newsroom/breaking` | `*/2 * * * *` | Son dakika worker |
| `/api/cron/newsroom/national` | `*/5 * * * *` | Ulusal worker |
| `/api/cron/newsroom/local` | `*/10 * * * *` | Yerel worker |
| `/api/cron/newsroom/trend` | `*/15 * * * *` | Trend worker |
| `/api/cron/newsroom/influencer` | `*/30 * * * *` | Influencer worker |
| `/api/cron/newsroom/process-queue` | `* * * * *` | Queue processor |
| `/api/cron/newsroom/archive` | `0 3 * * 0` | Haftalık arama backfill |
| `/api/events/sync` | `0 21 * * *` | Günlük (00:00 TR) |

### `newsDrafts` — AI Newsroom Kuyruğu

```typescript
{
  title, description, thumbnail, videoUrl,
  categoryId, city, district, citySlug, country, location,
  tags, source, sourceUrl, sourceLabel,
  draftStatus: 'pending_review' | 'rejected' | 'approved',
  moderationReasons?: string[],
  aiGenerated: true,
  rssFingerprint, rssGuid, ingestionSourceId,
  ingestedAt, createdAt, updatedAt,
  approvedNewsId?: string,  // onay sonrası
  approvedSlug?: string,
  // Newsroom pipeline
  editorId?, editorType?, confidenceScore?, factCheckFlags?,
  isBreaking?, priorityScore?, needsAdminReview?,
}
```

### `news` — Yayınlanmış Haber

```typescript
{
  slug: string,               // SEO URL: /news/[slug]
  status: 'published' | 'pending' | 'draft' | 'archived' | 'banned',
  title, description, thumbnail, videoUrl,
  categoryId, city, district, citySlug, country, location,
  tags, source, sourceUrl, publishedAt,
  viewsCount, likesCount, commentCount, savesCount, sharesCount,
  // ingestion audit (opsiyonel)
  aiGenerated?, rssFingerprint?, …
  // newsroom (feed pin / badge)
  editorId?, editorType?, confidenceScore?,
  isBreaking?, priorityScore?,
}
```

**Görünürlük:** `pending`, `draft` → public feed'te yok (`isPubliclyVisibleStatus`).

### API Routes

| Route | Method | Auth | Açıklama |
|-------|--------|------|----------|
| `/api/cron/news-ingest` | GET/POST | `CRON_SECRET` / admin token | Legacy RSS → AI → `newsDrafts` |
| `/api/cron/newsroom/ingest` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Birleşik ingest (yerel + son dakika) |
| `/api/cron/newsroom/local` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Yerel haber editörü (tek) |
| `/api/cron/newsroom/breaking` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Son dakika editörü (tek) |
| `/api/cron/newsroom/trend` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Trend editörü |
| `/api/cron/newsroom/influencer` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Influencer editörü |
| `/api/cron/newsroom/archive` | GET/POST | `NEWSROOM_CRON_SECRET` / `CRON_SECRET` | Arşiv backfill (`?days=90&maxAiCalls=20`) |
| `/api/admin/news-drafts/[id]/approve` | POST | Admin Firebase token | Draft → `news` + slug |
| `/api/admin/news-drafts/[id]/reject` | POST | Admin token | Draft reddet |
| `/api/admin/news/[id]/approve` | POST | Admin token | Legacy `news.status=pending` |
| `/api/events/sync` | GET/POST | `EVENTS_SYNC_SECRET` / `CRON_SECRET` / admin token | Günlük etkinlik sync (incremental) |
| `/api/rss` | GET | Public | RSS 2.0 feed (son 50 haber) |
| `/api/moderate` | POST | Server | OpenAI moderation |

**Cron (vercel.json):** newsroom breaking `*/5`, local `*/10`, trend `0 * * * *`, influencer `30 * * * *`, `events/sync` → `0 21 * * *` (00:00 Europe/Istanbul = 21:00 UTC)

**Event sync (incremental):** Cron scrapes Biletix/Bubilet/Biletino for 81 provinces, compares each record's `fingerprint` with Firestore, and only upserts new/changed docs. Unchanged rows are skipped (no rewrite). Events removed from a successful provider feed get `status: cancelled`. Elapsed events get `timelineStatus: past`. Client `useEvents` reads Firestore only; `/api/events/aggregate` is an empty-state fallback. Last run stats: `meta/eventSync`.

**SEO:** `/sitemap.xml` (Next `app/sitemap.ts`), canonical `/news/[slug]`

### Ortam Değişkenleri (Ingestion + Admin)

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `FIREBASE_ADMIN_PROJECT_ID` | Evet | Service account project |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Evet | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Evet | PEM (`\n` escaped) |
| `OPENAI_API_KEY` | Evet* | AI rewrite + moderation |
| `CRON_SECRET` | Prod cron | Vercel cron auth |
| `NEXT_PUBLIC_ADMIN_UIDS` | Dev admin | Bootstrap admin UID |
| `OPENAI_NEWS_MODEL` | Hayır | Varsayılan `gpt-4o-mini` |
| `NEWS_INGEST_MAX_AI_CALLS` | Hayır | Cron başına limit (12) |

`.env.local` gitignore'da — **asla commit etmeyin**.

### Komutlar

```bash
npm run dev
npm run ingest-news      # Legacy ingest
npm run newsroom-local   # Yerel haber editörü
npm run newsroom-breaking
npm run newsroom-trend
npm run newsroom-influencer
npm run newsroom-archive -- --days=90 --maxAiCalls=20
npm run sync-events
npx tsc --noEmit
firebase deploy --only firestore:rules,firestore:indexes
vercel --prod              # veya Git push → Vercel
```

### Admin Onay Akışı (newsDrafts — yalnızca düşük güven)

Normal akış **AUTO-PUBLISH** — onay gerekmez. Taslak kuyruğu yalnızca confidence <50 veya moderation review için:

1. Pipeline düşük güven/review → `newsDrafts`
2. `/admin/news` → **Onay Bekliyor**
3. **Onayla** → `POST /api/admin/news-drafts/:id/approve` → `news` publish
4. **Reddet** → `draftStatus: rejected`

### Feed Kişiselleştirme

`src/lib/feedRanking.ts` — sıralama: kullanıcı şehri → favori kategoriler → ilgi alanları → takip → engagement → ulusal.

### Deployment Checklist

1. Firebase Console: Firestore rules + indexes deploy
2. Vercel env: `FIREBASE_ADMIN_*`, `OPENAI_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_*`
3. `NEXT_PUBLIC_APP_URL` → production HTTPS domain (OG previews)
4. Admin: `users/{uid}.role = 'admin'` veya `NEXT_PUBLIC_ADMIN_UIDS` + bootstrap API
5. İlk yayın: Vercel cron worker'ları veya `npm run newsroom-workers`

---

**Hazırlanma Tarihi:** 2026-06-06 (güncelleme: 2026-06-07 production spec)
**Versiyon:** 1.2
