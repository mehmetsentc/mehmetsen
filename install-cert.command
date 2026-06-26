#!/bin/bash
set -e
echo "🔐 Apple Distribution sertifikası Keychain'e ekleniyor..."

# Import the .p12 into the login keychain (no password, allow all apps)
security import "$HOME/nahaber/ios_distribution.p12" \
  -P "" \
  -A \
  -k ~/Library/Keychains/login.keychain-db

echo ""
echo "✅ Sertifika eklendi!"
echo "Mevcut imzalama kimlikleri:"
security find-identity -v -p codesigning
