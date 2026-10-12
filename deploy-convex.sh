#!/bin/bash
# Deploy Convex functions script

echo "🚀 Deploying Convex functions..."
echo ""
echo "This will:"
echo "  1. Push the new manufacturers:listByNames function"
echo "  2. Update your Convex deployment"
echo ""

cd "$(dirname "$0")"

# Run convex dev --once to push functions
npx convex dev --once

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Convex functions deployed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Start your dev server: pnpm dev"
    echo "  2. Visit http://localhost:3000/chains"
    echo "  3. Manufacturer logos should now display!"
else
    echo ""
    echo "❌ Deployment failed. You may need to:"
    echo "  1. Run: npx convex login"
    echo "  2. Then run this script again"
fi
