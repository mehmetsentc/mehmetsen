#!/bin/bash
LOG="/Users/user/Downloads/keychain_check.log"

echo "=== Keychain Apple Credential Check ===" | tee "$LOG"
echo "Tarih: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "=== Internet passwords (Apple/Developer) ===" | tee -a "$LOG"
security find-internet-password -a "mehmetsentc@gmail.com" 2>&1 | tee -a "$LOG" || true
echo "---" | tee -a "$LOG"
security find-internet-password -s "apple.com" 2>&1 | grep -E "(acct|labl|svce|srvr)" | head -30 | tee -a "$LOG" || true

echo "" | tee -a "$LOG"
echo "=== Generic passwords (Xcode/altool) ===" | tee -a "$LOG"
security find-generic-password -a "mehmetsentc@gmail.com" 2>&1 | tee -a "$LOG" || true
echo "---" | tee -a "$LOG"
security find-generic-password -l "Xcode" 2>&1 | grep -E "(acct|labl|svce)" | head -20 | tee -a "$LOG" || true
echo "---" | tee -a "$LOG"
security find-generic-password -l "altool" 2>&1 | tee -a "$LOG" || true

echo "" | tee -a "$LOG"
echo "=== Tüm keychain item labels (Apple ile ilgili) ===" | tee -a "$LOG"
security dump-keychain 2>/dev/null | grep -E '(labl|acct|svce|srvr).*[Aa]pple\|[Aa]ltool\|[Xx]code\|developer' | head -50 | tee -a "$LOG" || true

echo "" | tee -a "$LOG"
echo "=== xcrun altool provider check ===" | tee -a "$LOG"
xcrun altool --list-providers -u "mehmetsentc@gmail.com" 2>&1 | head -20 | tee -a "$LOG" || true

echo "" | tee -a "$LOG"
echo "=== LOG: $LOG ===" | tee -a "$LOG"
echo ""
echo "Pencereyi kapatmak için Enter'a basın..."
read
