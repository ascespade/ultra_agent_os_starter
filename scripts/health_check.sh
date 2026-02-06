#!/bin/bash

BASE_URL="http://localhost:3000"

echo "Checking health of Ultra Agent OS APIs..."
echo "----------------------------------------"

endpoints=(
    "/health"
    "/worker/health"
    "/api/metrics/performance"
    "/api/metrics/queue-status"
    "/api/metrics/system"
    "/api/metrics/database"
    "/api/metrics/redis"
    "/api/metrics/health-detailed"
    "/api/jobs?limit=10"
    "/api/adapters/status"
    "/api/memory/workspace"
)

for endpoint in "${endpoints[@]}"; do
    echo -n "Checking $endpoint: "
    response=$(curl -s -w "%{http_code}" "$BASE_URL$endpoint")
    http_code="${response: -3}"
    body="${response::-3}"
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "\e[32mOK ($http_code)\e[0m"
    else
        echo -e "\e[31mFAILED ($http_code)\e[0m"
        echo "Response: $body"
    fi
done

echo "----------------------------------------"
echo "Health check complete."
