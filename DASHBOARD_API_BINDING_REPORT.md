# Dashboard API Binding Audit

## Overview
This report analyzes the binding between the Dashboard frontend (`apps/ui`) and the Backend API (`apps/api`).

## API Endpoint Analysis

| Dashboard Call | Backend Route | Status | Notes |
|----------------|---------------|--------|-------|
| `GET /health` | `health.routes.js` (via `server.js` or proxy) | **Bound** | Direct call to UI server health, or API health? UI server has `/health`. API likely has it too. |
| `GET /worker/health` | `worker.routes.js` | **Bound** | Likely proxied or needs explicit port handling if not proxied. |
| `GET /api/metrics/performance` | `metrics.routes.js` (`/performance`) | **Bound** | Correctly maps to DB-backed metrics. |
| `GET /api/metrics/queue-status` | `metrics.routes.js` (`/queue-status`) | **Bound** | Correctly maps to Redis-backed metrics. |
| `GET /api/jobs` | `jobs.routes.js` | **Bound** | Fetches job list. |
| `GET /api/memory/workspace` | `memory-v2.routes.js` (`/workspace`) | **Bound** | Fetches workspace memory. |
| `GET /api/adapters/status` | `adapter.routes.js` (`/status`) | **Bound** | Fetches adapter status. |
| `GET /api/metrics/system` | `metrics.routes.js` (`/system`) | **Available** | Not currently used by Dashboard. |
| `GET /api/metrics/database` | `metrics.routes.js` (`/database`) | **Available** | Not currently used by Dashboard. |
| `GET /api/metrics/redis` | `metrics.routes.js` (`/redis`) | **Available** | Not currently used by Dashboard. |
| `GET /api/admin/tenants` | `admin.routes.js` (`/tenants`) | **Available** | Not currently used by Dashboard. |

## Configuration
- **Base URL**: Dynamically resolved via `window.ENV.API_URL` injected by `server.js`.
- **Environment**: `API_URL` and `WS_URL` are passed correctly.

## Missing Bindings
- **System Screen**: Needs to bind to `/api/metrics/system`, `/api/metrics/database`, and `/api/metrics/redis`.
- **Admin Screen**: Needs to bind to `/api/admin/tenants`.
- **Job Actions**: `createTestJob`, `pauseQueue`, `clearQueue` are implemented as alerts/stubs and need real API calls (likely `POST /api/jobs`, etc.).

## Recommendations
1.  Implement `System` page consuming system/db/redis metrics.
2.  Implement `Admin` page consuming tenant management.
3.  Replace alert stubs with real API calls using `fetch`.
