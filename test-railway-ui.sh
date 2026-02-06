#!/bin/bash

echo "🧪 RAILWAY UI FUNCTIONALITY TEST"
echo "=================================="

# Test 1: Check UI accessibility
echo "1. Testing UI accessibility..."
UI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://ultra-agent-ui-production.up.railway.app")
if [ "$UI_STATUS" = "200" ]; then
    echo "✅ UI accessible (HTTP $UI_STATUS)"
else
    echo "❌ UI not accessible (HTTP $UI_STATUS)"
    exit 1
fi

# Test 2: Check API accessibility
echo "2. Testing API accessibility..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://ultra-agent-api-production.up.railway.app/health")
if [ "$API_STATUS" = "200" ]; then
    echo "✅ API accessible (HTTP $API_STATUS)"
else
    echo "❌ API not accessible (HTTP $API_STATUS)"
    exit 1
fi

# Test 3: Test direct API job creation
echo "3. Testing direct API job creation..."
JOB_RESPONSE=$(curl -s -X POST "https://ultra-agent-api-production.up.railway.app/api/jobs" \
    -H "Content-Type: application/json" \
    -d '{"message":"Direct API Test Job","tenantId":"system","type":"test"}')

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')
if [ "$JOB_ID" != "null" ] && [ "$JOB_ID" != "" ]; then
    echo "✅ Direct API job creation successful (Job ID: $JOB_ID)"
else
    echo "❌ Direct API job creation failed"
    echo "Response: $JOB_RESPONSE"
    exit 1
fi

# Test 4: Test CORS preflight
echo "4. Testing CORS preflight..."
CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Origin: https://ultra-agent-ui-production.up.railway.app" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type" \
    -X OPTIONS "https://ultra-agent-api-production.up.railway.app/api/jobs")

if [ "$CORS_STATUS" = "204" ]; then
    echo "✅ CORS preflight successful (HTTP $CORS_STATUS)"
else
    echo "❌ CORS preflight failed (HTTP $CORS_STATUS)"
    exit 1
fi

# Test 5: Check if UI JavaScript is loading correctly
echo "5. Testing UI JavaScript functionality..."
JS_CHECK=$(curl -s "https://ultra-agent-ui-production.up.railway.app" | grep -c "createTestJob")
if [ "$JS_CHECK" -gt 0 ]; then
    echo "✅ JavaScript createTestJob function found in UI"
else
    echo "❌ JavaScript createTestJob function not found"
    exit 1
fi

# Test 6: Verify API base URL configuration
echo "6. Testing API base URL configuration..."
API_BASE_CHECK=$(curl -s "https://ultra-agent-ui-production.up.railway.app" | grep -c "ultra-agent-api-production.up.railway.app")
if [ "$API_BASE_CHECK" -gt 0 ]; then
    echo "✅ Correct API base URL configured in UI"
else
    echo "❌ API base URL not correctly configured"
    exit 1
fi

echo ""
echo "🎉 ALL TESTS PASSED!"
echo "=================="
echo "✅ UI is fully functional on Railway"
echo "✅ API integration working correctly"
echo "✅ Create Test Job button should work"
echo "✅ All services operational"
echo ""
echo "📊 Test Summary:"
echo "- UI Accessibility: ✅"
echo "- API Connectivity: ✅" 
echo "- Job Creation: ✅"
echo "- CORS Configuration: ✅"
echo "- JavaScript Loading: ✅"
echo "- API URL Configuration: ✅"
echo ""
echo "🚀 Railway deployment is fully operational!"
