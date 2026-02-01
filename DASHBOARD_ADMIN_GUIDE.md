# Dashboard Admin Control Plane — Guide

**Orchestrator:** DASHBOARD_ADMIN_CONTROL_PLANE_ORCHESTRATOR v1.0.0  
**Precondition:** core-freeze-v1.0.0  
**Guards:** UI only; no backend, database, or API contract changes  
**Persona:** Platform Administrator

---

## 1. Overview

The Admin Control Plane is a **UI-only** dashboard that reads from the existing Core API. It provides a single place to monitor system state, jobs, database/Redis, integrations, auth health, configuration (read-only masked), and errors/alerts. All data comes from live API calls; no values are mocked.

---

## 2. How to Open the Admin Dashboard

- **URL:** Same as the main UI (e.g. `http://localhost:8088` or your Railway UI URL).
- **Entry:** Append `?admin=true` to the URL, or use a user-agent that contains `admin`.
- **Auth:** Log in with the same credentials as the main app (e.g. admin / your `DEFAULT_ADMIN_PASSWORD`). The dashboard uses the same `POST /api/auth/login` and stores the JWT for subsequent requests.

---

## 3. Mandatory Sections (All Present)

| Section | Purpose | Data source |
|--------|---------|-------------|
| **System Overview** | Core status, uptime, memory, queue length, job count | `/api/adapters/status` (core, redis), `/api/jobs` (length) |
| **Jobs & Workers** | List of jobs; click for detail | `/api/jobs`, `/api/jobs/:id` |
| **Live Logs (WebSocket)** | Real-time log stream | WebSocket (port from `WS_PORT` / env) |
| **Database & Redis Status** | PostgreSQL and Redis health, queue length/status | `/api/adapters/status` (database, redis) |
| **Integrations Status** | Ollama (LLM) and Docker adapter status | `/api/adapters/status` (adapters.ollama, adapters.docker) |
| **Security & Auth Health** | Logged-in user, token validity | Login response + success of `/api/adapters/status` |
| **Configuration (read-only masked)** | Adapter URLs/sockets, masked | `/api/adapters/status` (adapters.*.url, .socket); no toggles |
| **Error & Alerts View** | Recorded fetch/WebSocket errors | Client-side list (push on failed API/WS) |

---

## 4. Buttons and Actions (All Functional)

- **Refresh** — Calls `/api/adapters/status` and `/api/jobs` again; updates all sections and right-hand status; adds a log line.
- **Logout** — Clears stored token and WebSocket; shows login modal again.
- **Clear** (Live Logs) — Clears the in-page log buffer (last 100 entries).
- **Clear errors** (in Error & Alerts View) — Clears the in-page error list.
- **← Back to list** (Jobs) — Exits job detail and shows the jobs list again.
- **Logout** (in Security & Auth) — Same as header Logout.

No buttons perform backend changes (no toggles, rotate secrets, or restart); configuration is read-only and masked.

---

## 5. Data Sources (API Only)

- **GET /api/adapters/status** (Bearer) — System status: `database`, `redis` (including `queue_length`, `queue_status`), `adapters.ollama`, `adapters.docker`, `core` (status, uptime, memory), `timestamp`.
- **GET /api/jobs** (Bearer) — List of jobs for the current user.
- **GET /api/jobs/:id** (Bearer) — Single job detail (used when you click a job).
- **POST /api/auth/login** — Login; response includes `token` and `user`.
- **WebSocket** — Live logs; URL from `window.API_URL` and `window.WS_PORT` (injected by UI server).

No other endpoints are used; no mocked or hardcoded dashboard values.

---

## 6. Design and Errors

- **Style:** Enterprise, minimal, dark-neutral (existing admin CSS).
- **Errors:** Failed API or WebSocket connections are pushed to the **Error & Alerts View** and to **Live Logs**; login failures are also recorded there and shown in an alert.

---

## 7. Freeze and Guards

- **Required tag:** core-freeze-v1.0.0 (verified before dashboard work).
- **Guards respected:** No backend, database, or API contract changes; UI reads API only.
- **Outputs:** This guide (`DASHBOARD_ADMIN_GUIDE.md`) and tag `dashboard-freeze-v1.0.0` (applied after UI-only changes).

---

## 8. Usability

The dashboard is intended as a **daily admin console**: one place to check core health, queue, jobs, integrations, auth, and recent errors, with all values coming from the running system.
