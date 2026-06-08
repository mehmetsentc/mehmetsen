import { Language } from '@/lib/i18n';

export const translations = {
    tr: {
        // Common
        common: {
            appName: 'NaHaber',
            loading: 'Yükleniyor...',
            error: 'Hata oluştu',
            success: 'Başarılı',
            cancel: 'İptal',
            save: 'Kaydet',
            delete: 'Sil',
            edit: 'Düzenle',
            back: 'Geri',
        },

        // Navigation
        nav: {
            home: 'Anasayfa',
            feed: 'Akış',
            explore: 'Keşfet',
            notifications: 'Bildirimler',
            messages: 'Mesajlar',
            bookmarks: 'Kaydedilenler',
            profile: 'Profil',
            settings: 'Ayarlar',
            logout: 'Çıkış Yap',
            search: 'Ara',
        },

        // Auth
        auth: {
            login: 'Giriş Yap',
            register: 'Kayıt Ol',
            email: 'E-posta',
            password: 'Parola',
            confirmPassword: 'Parolayı Onayla',
            username: 'Kullanıcı Adı',
            displayName: 'Görünen Ad',
            forgotPassword: 'Parolanızı mı unuttunuz?',
            noAccount: 'Hesabınız yok mu? ',
            haveAccount: 'Zaten bir hesabınız var mı?',
            signUp: 'Kaydol',
            signIn: 'Giriş Yap',
            creatingAccount: 'Hesap oluşturuluyor...',
            signingIn: 'Giriş yapılıyor...',
            passwordMismatch: 'Parolalar eşleşmiyor',
            passwordTooShort: 'Parola en az 6 karakter olmalıdır',
            failedSignIn: 'Giriş yapılamadı',
            failedSignUp: 'Hesap oluşturulamadı',
        },

        // Posts
        posts: {
            createPost: 'Post Oluştur',
            title: 'Başlık',
            content: 'İçerik',
            excerpt: 'Özet',
            category: 'Kategori',
            images: 'Resimler',
            videos: 'Videolar',
            publish: 'Yayınla',
            draft: 'Taslak',
            edit: 'Düzenle',
            delete: 'Sil',
            like: 'Beğen',
            unlike: 'Beğenmekten Vazgeç',
            comment: 'Yorum Yap',
            share: 'Paylaş',
            save: 'Kaydet',
            unsave: 'Kaydetmekten Vazgeç',
            comments: 'Yorumlar',
            likes: 'Beğeniler',
            views: 'Görüntülemeler',
            noPosts: 'Henüz hiçbir post yok',
            noComments: 'Henüz hiçbir yorum yok',
            deleteConfirm: 'Bu postu silmek istediğinizden emin misiniz?',
            selectCategory: 'Kategori Seç',
            addMedia: 'Medya Ekle',
            dragDrop: 'Dosyaları buraya sürükleyip bırakın veya tıklayın',
            maxFileSize: 'Maksimum dosya boyutu: 50MB',
            maxFiles: 'Maksimum 10 dosya',
        },

        // Comments
        comments: {
            write: 'Bir yorum yazın...',
            reply: 'Yanıtla',
            delete: 'Sil',
            edit: 'Düzenle',
            cancel: 'İptal',
            save: 'Kaydet',
        },

        // Profile
        profile: {
            myProfile: 'Profilim',
            posts: 'Postlar',
            followers: 'Takipçiler',
            following: 'Takip Edilen',
            follow: 'Takip Et',
            unfollow: 'Takiptan Çık',
            edit: 'Profili Düzenle',
            settings: 'Hesap Ayarları',
            bio: 'Biyografi',
            website: 'Website',
            location: 'Konum',
            joinedDate: 'Katılım Tarihi',
            noFollowers: 'Henüz takipçi yok',
            noFollowing: 'Henüz kimseyi takip etmiyor',
        },

        // Search
        search: {
            placeholder: 'Ara...',
            noResults: 'Sonuç bulunamadı',
            searchPosts: 'Postlarda ara',
            searchPeople: 'Kişilerde ara',
            recentSearches: 'Son Aramalar',
            trending: 'Popüler',
        },

        // Categories
        categories: {
            all: 'Tümü',
            technology: 'Teknoloji',
            business: 'İş',
            politics: 'Politika',
            sports: 'Spor',
            entertainment: 'Eğlence',
            health: 'Sağlık',
            science: 'Bilim',
            world: 'Dünya',
            local: 'Yerel',
            yerelHaber: 'Yerel Haber',
            nearbyYou: 'Yakınınızda',
            localFeedHeader: '{city} — Yerel haberler',
        },

        // Admin
        admin: {
            dashboard: 'Yönetici Paneli',
            users: 'Kullanıcılar',
            posts: 'Postlar',
            categories: 'Kategoriler',
            reports: 'Raporlar',
            statistics: 'İstatistikler',
            totalUsers: 'Toplam Kullanıcı',
            totalPosts: 'Toplam Post',
            totalComments: 'Toplam Yorum',
            activeUsers: 'Aktif Kullanıcılar',
            manage: 'Yönet',
            ban: 'Yasakla',
            unban: 'Yasağı Kaldır',
            deleteUser: 'Kullanıcıyı Sil',
            approve: 'Onayla',
            reject: 'Reddet',
            pending: 'Beklemede',
        },

        // Errors & Validation
        errors: {
            required: 'Bu alan zorunludur',
            invalidEmail: 'Geçersiz e-posta adresi',
            passwordTooShort: 'Parola en az 6 karakter olmalıdır',
            userExists: 'Bu e-posta zaten kullanılıyor',
            invalidCredentials: 'Geçersiz kimlik bilgileri',
            notFound: 'Bulunamadı',
            unauthorized: 'Yetkisiz erişim',
            serverError: 'Sunucu hatası',
            networkError: 'Ağ hatası',
            tryAgain: 'Lütfen tekrar deneyin',
        },

        // Settings
        settings: {
            accountSettings: 'Hesap Ayarları',
            privacySettings: 'Gizlilik Ayarları',
            notificationSettings: 'Bildirim Ayarları',
            language: 'Dil',
            theme: 'Tema',
            darkMode: 'Koyu Mod',
            lightMode: 'Açık Mod',
            autoMode: 'Otomatik',
            changePassword: 'Parolayı Değiştir',
            twoFactor: 'İki Faktörlü Doğrulama',
            deactivateAccount: 'Hesabı Devre Dışı Bırak',
            deleteAccount: 'Hesabı Sil',
        },

        // Notifications
        notifications: {
            newLike: 'Postunuz beğenildi',
            newComment: 'Postunuza yorum yapıldı',
            newFollow: 'Seni takip etmeye başladı',
            newMessage: 'Yeni mesaj aldın',
            markAsRead: 'Okundu olarak işaretle',
            markAllAsRead: 'Tümünü okundu olarak işaretle',
            noNotifications: 'Bildirim yok',
        },

        // Messages
        messages: {
            messages: 'Mesajlar',
            noMessages: 'Henüz mesaj yok',
            startConversation: 'Sohbet başlat',
            type: 'Yazı yaz...',
            send: 'Gönder',
        },
    },

    en: {
        // Common
        common: {
            appName: 'NaHaber',
            loading: 'Loading...',
            error: 'Error occurred',
            success: 'Success',
            cancel: 'Cancel',
            save: 'Save',
            delete: 'Delete',
            edit: 'Edit',
            back: 'Back',
        },

        // Navigation
        nav: {
            home: 'Home',
            feed: 'Feed',
            explore: 'Explore',
            notifications: 'Notifications',
            messages: 'Messages',
            bookmarks: 'Bookmarks',
            profile: 'Profile',
            settings: 'Settings',
            logout: 'Logout',
            search: 'Search',
        },

        // Auth
        auth: {
            login: 'Login',
            register: 'Register',
            email: 'Email',
            password: 'Password',
            confirmPassword: 'Confirm Password',
            username: 'Username',
            displayName: 'Display Name',
            forgotPassword: 'Forgot password?',
            noAccount: "Don't have an account? ",
            haveAccount: 'Already have an account? ',
            signUp: 'Sign Up',
            signIn: 'Sign In',
            creatingAccount: 'Creating account...',
            signingIn: 'Signing in...',
            passwordMismatch: 'Passwords do not match',
            passwordTooShort: 'Password must be at least 6 characters',
            failedSignIn: 'Failed to sign in',
            failedSignUp: 'Failed to create account',
        },

        // Posts
        posts: {
            createPost: 'Create Post',
            title: 'Title',
            content: 'Content',
            excerpt: 'Excerpt',
            category: 'Category',
            images: 'Images',
            videos: 'Videos',
            publish: 'Publish',
            draft: 'Draft',
            edit: 'Edit',
            delete: 'Delete',
            like: 'Like',
            unlike: 'Unlike',
            comment: 'Comment',
            share: 'Share',
            save: 'Save',
            unsave: 'Unsave',
            comments: 'Comments',
            likes: 'Likes',
            views: 'Views',
            noPosts: 'No posts yet',
            noComments: 'No comments yet',
            deleteConfirm: 'Are you sure you want to delete this post?',
            selectCategory: 'Select Category',
            addMedia: 'Add Media',
            dragDrop: 'Drag and drop files here or click',
            maxFileSize: 'Max file size: 50MB',
            maxFiles: 'Max 10 files',
        },

        // Comments
        comments: {
            write: 'Write a comment...',
            reply: 'Reply',
            delete: 'Delete',
            edit: 'Edit',
            cancel: 'Cancel',
            save: 'Save',
        },

        // Profile
        profile: {
            myProfile: 'My Profile',
            posts: 'Posts',
            followers: 'Followers',
            following: 'Following',
            follow: 'Follow',
            unfollow: 'Unfollow',
            edit: 'Edit Profile',
            settings: 'Account Settings',
            bio: 'Bio',
            website: 'Website',
            location: 'Location',
            joinedDate: 'Joined Date',
            noFollowers: 'No followers yet',
            noFollowing: 'Not following anyone',
        },

        // Search
        search: {
            placeholder: 'Search...',
            noResults: 'No results found',
            searchPosts: 'Search posts',
            searchPeople: 'Search people',
            recentSearches: 'Recent Searches',
            trending: 'Trending',
        },

        // Categories
        categories: {
            all: 'All',
            technology: 'Technology',
            business: 'Business',
            politics: 'Politics',
            sports: 'Sports',
            entertainment: 'Entertainment',
            health: 'Health',
            science: 'Science',
            world: 'World',
            local: 'Local',
            yerelHaber: 'Local News',
            nearbyYou: 'Near you',
            localFeedHeader: '{city} — Local news',
        },

        // Admin
        admin: {
            dashboard: 'Admin Dashboard',
            users: 'Users',
            posts: 'Posts',
            categories: 'Categories',
            reports: 'Reports',
            statistics: 'Statistics',
            totalUsers: 'Total Users',
            totalPosts: 'Total Posts',
            totalComments: 'Total Comments',
            activeUsers: 'Active Users',
            manage: 'Manage',
            ban: 'Ban',
            unban: 'Unban',
            deleteUser: 'Delete User',
            approve: 'Approve',
            reject: 'Reject',
            pending: 'Pending',
        },

        // Errors & Validation
        errors: {
            required: 'This field is required',
            invalidEmail: 'Invalid email address',
            passwordTooShort: 'Password must be at least 6 characters',
            userExists: 'This email is already in use',
            invalidCredentials: 'Invalid credentials',
            notFound: 'Not found',
            unauthorized: 'Unauthorized access',
            serverError: 'Server error',
            networkError: 'Network error',
            tryAgain: 'Please try again',
        },

        // Settings
        settings: {
            accountSettings: 'Account Settings',
            privacySettings: 'Privacy Settings',
            notificationSettings: 'Notification Settings',
            language: 'Language',
            theme: 'Theme',
            darkMode: 'Dark Mode',
            lightMode: 'Light Mode',
            autoMode: 'Auto',
            changePassword: 'Change Password',
            twoFactor: 'Two Factor Authentication',
            deactivateAccount: 'Deactivate Account',
            deleteAccount: 'Delete Account',
        },

        // Notifications
        notifications: {
            newLike: 'Your post was liked',
            newComment: 'Your post was commented',
            newFollow: 'Started following you',
            newMessage: 'You have a new message',
            markAsRead: 'Mark as read',
            markAllAsRead: 'Mark all as read',
            noNotifications: 'No notifications',
        },

        // Messages
        messages: {
            messages: 'Messages',
            noMessages: 'No messages yet',
            startConversation: 'Start conversation',
            type: 'Type a message...',
            send: 'Send',
        },
    },
} as const;

export function getTranslation(language: Language, key: string): string {
    const keys = key.split('.');
    let value: any = translations[language];

    for (const k of keys) {
        value = value?.[k];
    }

    return value || key;
}

export function t(language: Language, key: string): string {
    return getTranslation(language, key);
}
