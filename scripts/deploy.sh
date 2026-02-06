#!/bin/bash
set -e

echo "🔒 Pre-deployment check..."
./scripts/verify-production.sh

echo "---------------------------------------------------"
echo "🚀 Verification Passed. Pushing to Main..."
echo "---------------------------------------------------"

git add .
git commit -m "chore: deployment update $(date)" || echo "No changes to commit"
git push origin main

echo "✅ Deployment triggered!"
