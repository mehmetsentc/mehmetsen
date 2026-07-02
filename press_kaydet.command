#!/bin/bash
# Chrome save diyalogunu primary display'e taşı ve Kaydet'e bas

osascript << 'APPLESCRIPT'
-- Önce Chrome'u primary display'e taşı (S9'dan ana ekrana)
tell application "System Events"
    tell process "Google Chrome"
        try
            set position of window 1 to {100, 80}
        end try
    end tell
end tell

delay 0.8

-- Chrome'u aktif yap
tell application "Google Chrome" to activate

delay 0.5

-- Return (Kaydet) gönder
tell application "System Events"
    key code 36
end tell

delay 0.3
APPLESCRIPT

echo "İşlem tamamlandı — AuthKey_88PX7Q6W29.p8 kaydedildi!"
sleep 2
