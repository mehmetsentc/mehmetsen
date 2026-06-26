#!/bin/bash
echo "=== Keychain sertifika durumu ==="
echo ""
echo "1. Tüm imzalama sertifikaları:"
security find-identity -v -p codesigning
echo ""
echo "2. Apple Distribution sertifikaları:"
security find-identity -v -p codesigning | grep -i "distribution" || echo "  ⚠️  Apple Distribution sertifikası YOK!"
echo ""
echo "3. .p12 dosyası mevcut mu?"
ls -la "$HOME/nahaber/ios_distribution.p12" && echo "  ✅ Dosya mevcut" || echo "  ❌ Dosya bulunamadı"
echo ""
echo "4. .p12 içeriği kontrol ediliyor..."
openssl pkcs12 -in "$HOME/nahaber/ios_distribution.p12" -passin pass: -info -noout 2>&1 | head -5 || echo "  ⚠️  .p12 açılamadı"
echo ""
echo "5. Keychain'e yükleniyor (verbose)..."
security import "$HOME/nahaber/ios_distribution.p12" \
  -P "" \
  -A \
  -k ~/Library/Keychains/login.keychain-db 2>&1
echo ""
echo "6. Import sonrası sertifika listesi:"
security find-identity -v -p codesigning
echo ""
echo "[İşlem tamamlandı]"
