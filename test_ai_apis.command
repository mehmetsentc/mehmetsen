#!/bin/bash
# AI API sağlık kontrolü — DeepSeek ve Gemini (+ canlı health)
# Geriye dönük uyumluluk: ai_api_health.command'a yönlendirir
cd "$(dirname "$0")"
exec bash ./ai_api_health.command
