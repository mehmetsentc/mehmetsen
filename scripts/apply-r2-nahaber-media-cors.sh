#!/bin/sh
# Apply CORS on the existing nahaber-media bucket (no new bucket).
set -e
cd "$(dirname "$0")/.."
node --env-file=.env.local scripts/apply-r2-nahaber-media-cors.mjs
