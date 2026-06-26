#!/bin/bash
LOG="$HOME/nahaber/build2.log"

xcodebuild \
  -project "$HOME/nahaber/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$HOME/nahaber/NaHaber.xcarchive" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=VMZA353GB7 \
  -allowProvisioningUpdates \
  -verbose \
  archive 2>&1 | tee "$LOG"

echo "Exit: ${PIPESTATUS[0]}" | tee -a "$LOG"
echo "Log: $LOG"
