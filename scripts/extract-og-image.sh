#!/bin/bash
# Extract og:image from a URL
URL="$1"
curl -sL --max-time 15 "$URL" | grep -oP 'og:image:secure_url"?\s*content="?\K[^">\s]+' | head -1 || \
curl -sL --max-time 15 "$URL" | grep -oP 'og:image"?\s*content="?\K[^">\s]+' | head -1
