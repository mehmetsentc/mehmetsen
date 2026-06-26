#!/bin/bash
# NaHaber - App Icon Setup Script
# logo.png (1254x1254) → tüm gerekli boyutlar

set -e

SRC="$HOME/Downloads/logo.png"
DEST="$HOME/nahaber/public/brand"

if [ ! -f "$SRC" ]; then
  echo "❌ $SRC bulunamadı!"
  exit 1
fi

echo "📂 Kaynak: $SRC"
echo "📁 Hedef: $DEST"

# logo.png'yi brand klasörüne kopyala
cp "$SRC" "$DEST/logo.png"
echo "✅ logo.png kopyalandı"

# sips ile boyutlandır (macOS yerleşik — kurulum gerektirmez)
BRAND="$HOME/nahaber/public/brand"
SRC_BRAND="$BRAND/logo.png"

resize() {
  local name=$1 size=$2
  sips -z $size $size "$SRC_BRAND" --out "$BRAND/$name" > /dev/null
  echo "  ✅ $name (${size}×${size})"
}

resize "app-icon-1024.png" 1024
resize "icon-512.png" 512
resize "icon-192.png" 192
resize "apple-touch-icon.png" 180

# public kökündeki apple-touch-icon'u da güncelle
sips -z 180 180 "$SRC_BRAND" --out "$HOME/nahaber/public/apple-touch-icon.png" > /dev/null
echo "  ✅ public/apple-touch-icon.png güncellendi"

echo ""
echo "🎉 Tüm ikonlar hazır!"
echo "   App Store için: $BRAND/app-icon-1024.png (1024×1024)"
