#!/bin/bash
# ============================================================
# NaHaber — Keychain Fix & Build
# Keychain parolasını doğrular ve codesign'ı önceden yetkilendirir
# ============================================================

LOG="/Users/user/Downloads/keychain_fix.log"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

echo "============================================================" | tee "$LOG"
echo "NaHaber Keychain Fix" | tee -a "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo ""

# --- Mac Login Parolasını Sor ---
echo "Mac login parolanızı girin (ekranda görünmeyecek):"
read -s PASS
echo ""

if [ -z "$PASS" ]; then
  echo "❌ Parola boş bırakıldı. Lütfen Mac login parolanızı girin." | tee -a "$LOG"
  echo "Çıkmak için ENTER'a basın..."
  read
  exit 1
fi

# --- Keychain'i Aç ---
echo "Keychain açılıyor..." | tee -a "$LOG"
if security unlock-keychain -p "$PASS" "$KEYCHAIN" 2>/dev/null; then
  echo "✅ Keychain başarıyla açıldı!" | tee -a "$LOG"
else
  echo "" | tee -a "$LOG"
  echo "❌ PAROLA YANLIŞ — Keychain bu parolayla açılamadı." | tee -a "$LOG"
  echo "" | tee -a "$LOG"
  echo "Olası nedenler:" | tee -a "$LOG"
  echo "  - Farklı bir eski parola kullanılmış olabilir" | tee -a "$LOG"
  echo "  - Caps Lock açık olabilir" | tee -a "$LOG"
  echo "" | tee -a "$LOG"
  echo "Çıkmak için ENTER'a basın, sonra farklı bir yöntem deneyelim..."
  read
  exit 1
fi

# --- Codesign için Önceden Yetkilendir ---
echo "" | tee -a "$LOG"
echo "Codesign yetkilendiriliyor..." | tee -a "$LOG"
if security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s -k "$PASS" \
    "$KEYCHAIN" 2>&1 | tee -a "$LOG"; then
  echo "✅ Codesign önceden yetkilendirildi — artık dialog çıkmayacak!" | tee -a "$LOG"
else
  echo "⚠️ Yetkilendirme kısmen başarısız, build yine de deneniyor..." | tee -a "$LOG"
fi

# --- Keychain'e Liste Ekle ---
security list-keychains -d user -s "$KEYCHAIN" 2>/dev/null || true

echo "" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo "✅ HAZIR — Şimdi build başlatılıyor..." | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo ""

sleep 2

# --- Build Script'i Çalıştır ---
bash /Users/user/nahaber/build_v1.2_b5.command

echo ""
echo "Kapatmak için ENTER'a basın..."
read
