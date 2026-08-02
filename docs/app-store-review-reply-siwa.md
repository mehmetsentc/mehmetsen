# App Store Review — Sign in with Apple (Build 13)

## App Store Connect’e yanıt (kopyala-yapıştır)

```
Hello,

Thank you for the feedback on Sign in with Apple (Submission 6e704c80-3e2d-4b85-b6c8-632c83974037, version 1.2 build 12).

We identified and fixed a native plugin registration bug that caused Sign in with Apple to fail immediately with an error toast on iPad (including iPad Air 11-inch). The Sign in with Apple plugin was compiled into the binary but was not registered with the Capacitor bridge, so the login button could not open the Apple sheet.

Build 13 (version 1.2) includes:
1. Proper CAPBridgedPlugin registration for NativeAppleSignIn
2. Explicit plugin registration in AppViewController
3. Direct ASAuthorizationController presentation from the bridge view controller (no fragile overlay VC)
4. One automatic retry for transient iPadOS presentation errors

How to verify on review devices (iPhone and iPad):
1. Launch NaHaber
2. Open Login / Giriş
3. Tap “Apple ile devam et”
4. Complete Sign in with Apple — the native Apple sheet should appear and sign-in should succeed

Test account is not required for Sign in with Apple; please use any Apple ID available on the review device.

Thank you,
NaHaber Team
```

## App Review Notes (Submission form)

```
Sign in with Apple:
- Tap “Apple ile devam et” on the login screen.
- The native Apple authentication sheet appears (no Safari / web popup).
- Use any Apple ID on the review device; no special demo account is required for Apple Sign-In.

Email/password demo (optional):
- Use the credentials provided in App Review Information if you prefer not to use Apple Sign-In first.
```

## Yerel test checklist (göndermeden önce)

- [ ] iPad’de clean install (önceki sürümü sil → TestFlight/IPA yükle)
- [ ] Login → Apple ile devam et → Apple sheet açılıyor
- [ ] Giriş başarılı, profil/ayarlar açılıyor
- [ ] İptal: sheet kapatılınca hata toast’u çıkmıyor
- [ ] iPhone’da aynı akış
