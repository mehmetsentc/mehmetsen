#!/bin/bash
# Xcode Settings > Accounts'u AppleScript ile aç
osascript << 'EOF'
tell application "Xcode"
    activate
    delay 1
end tell
tell application "System Events"
    tell process "Xcode"
        -- Xcode > Settings... menüsünü aç (Cmd+,)
        keystroke "," using command down
        delay 2
    end tell
end tell
EOF
echo "Xcode Settings açıldı. Accounts sekmesine gidin ve Apple ID ile giriş yapın."
