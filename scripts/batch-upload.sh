#!/bin/bash
# Batch upload images for plugins
# Usage: ./batch-upload.sh manufacturer_id

cd ~/clawd/projects/plugin-radar

# Function to extract og:image from URL
extract_og_image() {
    local url="$1"
    local img=$(curl -sL --max-time 20 "$url" 2>/dev/null | grep -oP 'property="og:image:secure_url"\s*content="\K[^"]+' | head -1)
    if [ -z "$img" ]; then
        img=$(curl -sL --max-time 20 "$url" 2>/dev/null | grep -oP 'property="og:image"\s*content="\K[^"]+' | head -1)
    fi
    # Try alternate format
    if [ -z "$img" ]; then
        img=$(curl -sL --max-time 20 "$url" 2>/dev/null | grep -oP 'og:image"\s*content="\K[^"]+' | head -1)
    fi
    # Convert http to https
    echo "${img/http:/https:}"
}

# Process each line from stdin (format: plugin_id url)
while read -r plugin_id url; do
    echo "Processing $plugin_id: $url"
    
    img=$(extract_og_image "$url")
    
    if [ -n "$img" ]; then
        echo "  Found image: $img"
        result=$(npx convex run storage:uploadFromUrl "{\"url\":\"$img\",\"pluginId\":\"$plugin_id\"}" 2>/dev/null)
        if echo "$result" | grep -q "storageId"; then
            echo "  ✓ Uploaded successfully"
        else
            echo "  ✗ Upload failed: $result"
        fi
    else
        echo "  ✗ No og:image found"
    fi
    
    sleep 1  # Rate limiting
done
