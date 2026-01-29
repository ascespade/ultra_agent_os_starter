#!/bin/bash

echo "Generating Railway secrets for Ultra Agent OS..."

# Generate secure secrets
JWT_SECRET=$(openssl rand -base64 32)
INTERNAL_API_KEY=$(openssl rand -base64 24)

echo "Run these commands to set Railway variables:"
echo ""
echo "railway variables set JWT_SECRET=\"$JWT_SECRET\""
echo "railway variables set INTERNAL_API_KEY=\"$INTERNAL_API_KEY\""
echo ""
echo "Or set them in Railway UI dashboard:"
echo "JWT_SECRET: $JWT_SECRET"
echo "INTERNAL_API_KEY: $INTERNAL_API_KEY"
