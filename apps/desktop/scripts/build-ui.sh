#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
UI_DIR="$PROJECT_DIR/ui"
RESOURCES_DIR="$PROJECT_DIR/resources"

echo "Building React UI..."

# Navigate to UI directory
cd "$UI_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the React app
echo "Building production bundle..."
npm run build

# Create resources directory if it doesn't exist
mkdir -p "$RESOURCES_DIR"

# Create ZIP file from dist
echo "Creating ui.zip..."
cd dist
zip -r "$RESOURCES_DIR/ui.zip" . -x "*.map"
cd ..

echo "UI build complete!"
echo "Output: $RESOURCES_DIR/ui.zip"
