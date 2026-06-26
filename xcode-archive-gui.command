#!/bin/bash
# Xcode GUI üzerinden Archive tetikle (Apple ID credentials kullanır)
echo "Xcode GUI Archive başlatılıyor..."
osascript << 'EOF'
tell application "Xcode"
    activate
    delay 2
end tell
tell application "System Events"
    tell process "Xcode"
        -- Product > Archive menüsünü tıkla
        click menu item "Archive" of menu "Product" of menu bar 1
        delay 1
    end tell
end tell
EOF
echo "Xcode'da Product > Archive tetiklendi."
echo "Xcode Organizer penceresi açılacak, orada 'Distribute App' ile yükleyebilirsiniz."
